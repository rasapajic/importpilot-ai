import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import {
  MAX_ATTACHMENTS,
  MAX_MESSAGE_BYTES,
  MAX_TEXT_CHARS,
  attachmentText,
  canDownloadAttachment,
  classifyAttachment,
  safeFilename,
  syntheticMalwareScan,
} from "@/modules/supplier-inbox/domain/attachment-policy";
import { isInboundMailEnabled } from "@/modules/supplier-inbox/domain/feature-flag";
import { buildClarificationFollowUp } from "@/modules/supplier-inbox/domain/follow-up";
import { translateToSerbianFixture } from "@/modules/supplier-inbox/domain/fixture-translation";
import {
  extractQuoteWithFixtureAdapter,
  type InboxRequirement,
} from "@/modules/supplier-inbox/domain/quote-extraction";
import {
  hashReplyToken,
  parseReplyRecipient,
  redactSecrets,
  sha256Hex,
} from "@/modules/supplier-inbox/domain/reply-token";
import { sanitizeInboundText } from "@/modules/supplier-inbox/domain/sanitize";
import {
  resolveSenderTrust,
  storedAuthenticationResults,
} from "@/modules/supplier-inbox/domain/sender-trust";
import {
  isSyntheticProviderContext,
  type SyntheticHandlerResult,
  type SyntheticInboundEnvelope,
  type SyntheticProviderContext,
} from "@/modules/supplier-inbox/domain/types";

const PROVIDER = "synthetic";
const QUARANTINE_DAYS = 14;

export type InboundLogger = (line: string) => void;

export type SyntheticHandlerOptions = {
  failBeforeCommit?: boolean;
  failDuringParse?: boolean;
  now?: Date;
  logger?: InboundLogger;
  maxFailedAttempts?: number;
};

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function log(logger: InboundLogger | undefined, secrets: string[], line: string) {
  logger?.(redactSecrets(line, secrets));
}

function emptyResult(httpStatus: SyntheticHandlerResult["httpStatus"]): SyntheticHandlerResult {
  return {
    httpStatus,
    stored: false,
    duplicate: false,
    quarantined: false,
    messageId: null,
    organizationId: null,
    threadId: null,
  };
}

function snapshot(envelope: SyntheticInboundEnvelope, secrets: string[]) {
  const json = redactSecrets(JSON.stringify({
    from: envelope.fromAddress,
    to: envelope.toAddresses,
    subject: envelope.subject,
    receivedAt: envelope.receivedAt,
    providerMessageId: envelope.providerMessageId,
    inReplyTo: envelope.inReplyTo ?? null,
    references: envelope.references ?? [],
    text: envelope.textBody,
    html: envelope.htmlBody ?? null,
    untrustedAuthenticationResultsHeader: envelope.rawAuthenticationResults ?? null,
  }), secrets);
  return { json, sha256: sha256Hex(json), key: `db:supplier-inbox/synthetic/${sha256Hex(json)}` };
}

function envelopeProblem(envelope: SyntheticInboundEnvelope): SyntheticHandlerResult["httpStatus"] | null {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(envelope.providerMessageId)) return 400;
  if (!envelope.fromAddress.includes("@") || envelope.fromAddress.length > 320) return 400;
  if (envelope.subject.length > 500) return 400;
  if (envelope.textBody.length > MAX_TEXT_CHARS || (envelope.htmlBody?.length ?? 0) > MAX_TEXT_CHARS) return 413;
  if (Number.isNaN(Date.parse(envelope.receivedAt))) return 400;
  const attachments = envelope.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS) return 400;
  const total = attachments.reduce((sum, item) => sum + item.bytes.byteLength, 0);
  if (total > MAX_MESSAGE_BYTES) return 413;
  return null;
}

async function findByProviderMessage(providerMessageId: string) {
  return prisma.supplierInboundMessage.findUnique({
    where: { provider_providerMessageId: { provider: PROVIDER, providerMessageId } },
  });
}

export async function handleSyntheticInbound(
  envelope: SyntheticInboundEnvelope,
  context: SyntheticProviderContext | null,
  options: SyntheticHandlerOptions = {},
): Promise<SyntheticHandlerResult> {
  if (!isInboundMailEnabled()) {
    log(options.logger, [], "inbound mail disabled");
    return emptyResult(403);
  }
  if (!isSyntheticProviderContext(context)) {
    log(options.logger, [], "inbound provider authentication failed");
    return emptyResult(401);
  }

  const problem = envelopeProblem(envelope);
  if (problem) return emptyResult(problem);
  const token = parseReplyRecipient(envelope.recipient);
  if (!token) {
    return quarantine(envelope, "UNKNOWN_TOKEN", null);
  }

  const tokenRow = await prisma.supplierInboxReplyToken.findUnique({
    where: { tokenHash: hashReplyToken(token) },
    include: { thread: true },
  });
  if (!tokenRow) return quarantine(envelope, "UNKNOWN_TOKEN", [token]);
  if (tokenRow.status !== "ACTIVE") {
    const result = await quarantine(envelope, "REVOKED_TOKEN", [token]);
    if (!result.duplicate) {
      await prisma.supplierInboxEvent.create({
        data: {
          organizationId: tokenRow.organizationId,
          threadId: tokenRow.threadId,
          type: "TOKEN_REJECTED",
          metadata: { summary: "A revoked reply token was rejected." },
        },
      });
    }
    return result;
  }

  if (options.failBeforeCommit) {
    return recordOutage(tokenRow.thread.id, tokenRow.organizationId, envelope.providerMessageId, options);
  }

  log(options.logger, [token], `synthetic inbound accepted recipient=${envelope.recipient}`);
  const stored = await storeOnThread(envelope, tokenRow.thread, token);
  if (options.failDuringParse && !stored.duplicate) {
    return { ...stored, httpStatus: 500 };
  }
  await ensureParsed(stored.messageId as string, options.now ?? new Date());
  return stored;
}

async function recordOutage(
  threadId: string,
  organizationId: string,
  providerMessageId: string,
  options: SyntheticHandlerOptions,
): Promise<SyntheticHandlerResult> {
  const maxFailedAttempts = options.maxFailedAttempts ?? 3;
  await prisma.supplierIngestionAttempt.create({
    data: { organizationId, threadId, provider: PROVIDER, providerMessageId },
  });
  const attempts = await prisma.supplierIngestionAttempt.count({
    where: { provider: PROVIDER, providerMessageId },
  });
  if (attempts >= maxFailedAttempts) {
    await prisma.supplierInboxThread.update({
      where: { id: threadId },
      data: { ingestionDelayed: true },
    });
    await prisma.supplierInboxEvent.create({
      data: {
        organizationId,
        threadId,
        type: "INGESTION_DELAYED",
        metadata: {
          summary: "Ingestion is delayed. The RFQ was not resent.",
          attempts,
          providerMessageId,
        },
      },
    });
  }
  return { ...emptyResult(500), threadId, organizationId };
}

async function quarantine(
  envelope: SyntheticInboundEnvelope,
  reason: "UNKNOWN_TOKEN" | "REVOKED_TOKEN",
  secrets: string[] | null,
): Promise<SyntheticHandlerResult> {
  const tokenSecrets = secrets ?? [];
  const receivedAt = new Date(envelope.receivedAt);
  const existing = await findByProviderMessage(envelope.providerMessageId);
  if (existing) {
    return {
      httpStatus: 200,
      stored: false,
      duplicate: true,
      quarantined: true,
      messageId: existing.id,
      organizationId: null,
      threadId: null,
    };
  }
  const raw = snapshot(envelope, tokenSecrets);
  const originalText = redactSecrets(envelope.textBody, tokenSecrets);
  const sanitizedText = sanitizeInboundText(redactSecrets(`${envelope.textBody}\n${envelope.htmlBody ?? ""}`, tokenSecrets));
  try {
    const message = await prisma.supplierInboundMessage.create({
      data: {
        organizationId: null,
        threadId: null,
        provider: PROVIDER,
        providerMessageId: envelope.providerMessageId,
        receivedAt,
        fromAddress: envelope.fromAddress,
        subject: envelope.subject,
        rawSha256: raw.sha256,
        rawObjectKey: raw.key,
        rawMessage: raw.json,
        originalText,
        sanitizedText,
        senderTrust: null,
        authenticationResults: storedAuthenticationResults(envelope.providerAuth) as Prisma.InputJsonValue,
        source: "SYNTHETIC",
        inReplyTo: envelope.inReplyTo ?? null,
        referencesHeader: envelope.references?.join(" ") ?? null,
        quarantineReason: reason,
        retentionExpiresAt: new Date(receivedAt.getTime() + QUARANTINE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return {
      httpStatus: 200,
      stored: true,
      duplicate: false,
      quarantined: true,
      messageId: message.id,
      organizationId: null,
      threadId: null,
    };
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const existing = await findByProviderMessage(envelope.providerMessageId);
    return {
      httpStatus: 200,
      stored: false,
      duplicate: true,
      quarantined: true,
      messageId: existing?.id ?? null,
      organizationId: null,
      threadId: null,
    };
  }
}

async function storeOnThread(
  envelope: SyntheticInboundEnvelope,
  thread: {
    id: string;
    organizationId: string;
    expectedSupplierEmail: string | null;
    replyTokenHash: string;
  },
  token: string,
): Promise<SyntheticHandlerResult> {
  const existing = await findByProviderMessage(envelope.providerMessageId);
  if (existing) {
    return {
      httpStatus: 200,
      stored: false,
      duplicate: true,
      quarantined: existing.organizationId === null,
      messageId: existing.id,
      organizationId: existing.organizationId,
      threadId: existing.threadId,
    };
  }
  const raw = snapshot(envelope, [token]);
  const originalText = redactSecrets(envelope.textBody, [token]);
  const sanitizedText = sanitizeInboundText(redactSecrets(`${envelope.textBody}\n${envelope.htmlBody ?? ""}`, [token]));
  const senderTrust = resolveSenderTrust({
    providerAuth: envelope.providerAuth,
    expectedSupplierEmail: thread.expectedSupplierEmail,
    fromAddress: envelope.fromAddress,
  });
  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierInboundMessage.create({
        data: {
          organizationId: thread.organizationId,
          threadId: thread.id,
          provider: PROVIDER,
          providerMessageId: envelope.providerMessageId,
          receivedAt: new Date(envelope.receivedAt),
          fromAddress: envelope.fromAddress,
          subject: envelope.subject,
          rawSha256: raw.sha256,
          rawObjectKey: raw.key,
          rawMessage: raw.json,
          originalText,
          sanitizedText,
          senderTrust,
          authenticationResults: storedAuthenticationResults(envelope.providerAuth) as Prisma.InputJsonValue,
          source: "SYNTHETIC",
          inReplyTo: envelope.inReplyTo ?? null,
          referencesHeader: envelope.references?.join(" ") ?? null,
        },
      });
      for (const attachment of envelope.attachments ?? []) {
        const filename = safeFilename(attachment.filename);
        const classification = classifyAttachment(attachment);
        const allowed = classification.allowed;
        const scan = allowed ? syntheticMalwareScan(attachment.bytes) : "REJECTED";
        const scanStatus = !allowed || scan === "REJECTED" ? "REJECTED" : "CLEAN";
        await tx.supplierInboundAttachment.create({
          data: {
            messageId: created.id,
            organizationId: thread.organizationId,
            filename,
            declaredMime: attachment.declaredMime.slice(0, 127),
            detectedMime: classification.detectedMime,
            sizeBytes: attachment.bytes.byteLength,
            sha256: sha256Hex(attachment.bytes),
            storageKey: `db:supplier-inbox/${created.id}/${sha256Hex(attachment.bytes)}`,
            scanStatus,
            rejectionReason: classification.reason ?? (scan === "REJECTED" ? "MALWARE" : null),
            content: scanStatus === "CLEAN" && canDownloadAttachment(scanStatus) ? Buffer.from(attachment.bytes) : null,
          },
        });
      }
      await tx.supplierInboxEvent.create({
        data: {
          organizationId: thread.organizationId,
          threadId: thread.id,
          type: "REPLY_RECEIVED",
          metadata: { summary: "Supplier reply stored.", messageId: created.id, senderTrust },
        },
      });
      await tx.supplierInboxThread.update({
        where: { id: thread.id },
        data: { status: "RECEIVED", ingestionDelayed: false },
      });
      return created;
    });
    return {
      httpStatus: 200,
      stored: true,
      duplicate: false,
      quarantined: false,
      messageId: message.id,
      organizationId: thread.organizationId,
      threadId: thread.id,
    };
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const existing = await findByProviderMessage(envelope.providerMessageId);
    return {
      httpStatus: 200,
      stored: false,
      duplicate: true,
      quarantined: false,
      messageId: existing?.id ?? null,
      organizationId: existing?.organizationId ?? null,
      threadId: existing?.threadId ?? null,
    };
  }
}

export async function ensureParsed(messageId: string, now = new Date()): Promise<void> {
  const message = await prisma.supplierInboundMessage.findUnique({
    where: { id: messageId },
    include: { attachments: true, thread: true },
  });
  if (!message?.thread || !message.organizationId || message.parseCompletedAt) return;

  const requirement = message.thread.requirement as InboxRequirement;
  const sources = [
    { label: "Body", text: message.originalText, attachmentId: null, page: null },
    ...message.attachments
      .filter((attachment) => attachment.scanStatus === "CLEAN" && attachment.content)
      .map((attachment) => ({
        label: attachment.filename,
        text: attachmentText(attachment.content as Uint8Array),
        attachmentId: attachment.id,
        page: attachment.detectedMime === "application/pdf" ? 1 : null,
      })),
  ];
  const extraction = extractQuoteWithFixtureAdapter({ sources, requirement, now });
  const translation = translateToSerbianFixture(message.originalText);
  const status = extraction.needsClarification ? "NEEDS_CLARIFICATION" : "PARSED";

  await prisma.$transaction(async (tx) => {
    const current = await tx.supplierInboundMessage.findUnique({
      where: { id: message.id },
      select: { parseCompletedAt: true },
    });
    if (current?.parseCompletedAt) return;
    await tx.supplierMessageTranslation.create({
      data: {
        messageId: message.id,
        organizationId: message.organizationId as string,
        locale: "sr",
        translatedText: translation.text,
        modelId: translation.modelId,
      },
    });
    for (const item of extraction.fields) {
      await tx.supplierQuoteExtraction.create({
        data: {
          threadId: message.threadId as string,
          messageId: message.id,
          organizationId: message.organizationId as string,
          fieldKey: item.fieldKey,
          valueJson: item.value as Prisma.InputJsonValue,
          confidence: item.confidence,
          citationSnippet: item.snippet,
          citationAttachmentId: item.attachmentId,
          citationPage: item.page,
          flag: item.flag,
          reviewStatus: "UNREVIEWED",
        },
      });
    }
    if (extraction.needsClarification) {
      const existingFollowUp = await tx.supplierOutboundMessage.findFirst({
        where: { threadId: message.threadId as string, kind: "FOLLOW_UP" },
        select: { id: true },
      });
      if (!existingFollowUp) {
        const rfq = await tx.supplierOutboundMessage.findFirst({
          where: { threadId: message.threadId as string, kind: "RFQ" },
        });
        const draft = buildClarificationFollowUp({
          supplierName: message.thread?.supplierName ?? "supplier",
          fromAddress: rfq?.fromAddress ?? "inbox@example.test",
          toAddress: rfq?.toAddress ?? message.fromAddress,
          replyTokenHash: message.thread?.replyTokenHash ?? "",
          conflicts: extraction.fields.filter((item) => item.flag !== "NONE").map((item) => `${item.fieldKey} is ${item.flag}`),
        });
        await tx.supplierOutboundMessage.create({
          data: {
            organizationId: message.organizationId as string,
            threadId: message.threadId as string,
            authorUserId: message.thread?.createdByUserId as string,
            kind: "FOLLOW_UP",
            status: "DRAFT",
            fromAddress: rfq?.fromAddress ?? "inbox@example.test",
            toAddress: rfq?.toAddress ?? message.fromAddress,
            replyTokenHash: message.thread?.replyTokenHash ?? "",
            subject: draft.subject,
            body: draft.body,
            contentHash: draft.contentHash,
          },
        });
        await tx.supplierInboxEvent.create({
          data: {
            organizationId: message.organizationId,
            threadId: message.threadId,
            type: "FOLLOW_UP_DRAFTED",
            metadata: { summary: "Clarification draft created. It was not sent." },
          },
        });
      }
    }
    await tx.supplierInboundMessage.update({
      where: { id: message.id },
      data: { parseCompletedAt: now },
    });
    await tx.supplierInboxThread.update({
      where: { id: message.threadId as string },
      data: { status },
    });
    await tx.supplierInboxEvent.create({
      data: {
        organizationId: message.organizationId,
        threadId: message.threadId,
        type: status === "NEEDS_CLARIFICATION" ? "NEEDS_CLARIFICATION" : "PARSED",
        metadata: {
          summary: status === "NEEDS_CLARIFICATION"
            ? "Parsed quote needs clarification. No monetary calculation was changed."
            : "Parsed quote is unreviewed. No monetary calculation was changed.",
          extractor: extraction.modelId,
        },
      },
    });
  });
}
