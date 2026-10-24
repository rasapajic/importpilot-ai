import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma";
import { getSupplierConfirmation } from "@/modules/negotiation/application/supplier-confirmation-service";
import { checkSupplierMailSendIntent } from "@/modules/negotiation/domain/supplier-mail-link";
import {
  gmailAcceptanceEnabled,
  gmailAcceptanceRecipientAllowed,
  gmailOAuthConfig,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";
import {
  refreshGmailAccessToken,
  revokeGmailToken,
} from "@/modules/negotiation/infrastructure/gmail-oauth";
import {
  buildGmailRawMessage,
  createGmailMessageId,
  sendGmailMessage,
} from "@/modules/negotiation/infrastructure/gmail-send";
import {
  decryptMailboxJson,
  decryptMailboxSecret,
  encryptMailboxJson,
  encryptMailboxSecret,
} from "@/modules/negotiation/infrastructure/mailbox-token-vault";

export class SupplierMailUnavailableError extends Error {}
export class SupplierMailRequestDeniedError extends Error {}
export class SupplierMailAlreadyReservedError extends Error {}
export class SupplierMailDeliveryUncertainError extends Error {}

const GMAIL_PROOF_AAD = "jakov360:gmail:preview:v1";
const PREVIEW_TTL_MS = 5 * 60_000;

type AuthContext = { organizationId: string; userId: string };

export function gmailMailContentHash(input: {
  sender: string; recipient: string; subject: string; body: string;
}) {
  return createHash("sha256").update(JSON.stringify([
    input.sender.trim().toLowerCase(),
    input.recipient.trim().toLowerCase(),
    input.subject.trim(),
    input.body.trim(),
  ])).digest("hex");
}

type PreviewProof = {
  organizationId: string;
  userId: string;
  projectId: string;
  confirmationId: string;
  connectionId: string;
  recipient: string;
  hash: string;
  expiresAt: number;
};

async function currentGmailDraft(
  context: AuthContext,
  input: {
    projectId: string;
    productUrl: string;
    connectionId: string;
    recipient: string;
  },
) {
  if (
    !gmailAcceptanceEnabled(context.organizationId) ||
    !gmailAcceptanceRecipientAllowed(input.recipient)
  ) throw new SupplierMailUnavailableError();

  const connection = await prisma.mailboxConnection.findFirst({
    where: {
      id: input.connectionId,
      organizationId: context.organizationId,
      userId: context.userId,
      provider: "GMAIL",
      disconnectedAt: null,
      encryptedRefreshToken: { not: null },
    },
  });
  if (!connection) throw new SupplierMailRequestDeniedError();

  const project = await prisma.importProject.findFirst({
    where: { id: input.projectId, organizationId: context.organizationId },
    select: { name: true },
  });
  if (!project || !project.name.startsWith("[DEMO]")) {
    // First acceptance rollout may never send from a real sourcing project.
    throw new SupplierMailRequestDeniedError();
  }

  const view = await getSupplierConfirmation(
    input.projectId,
    context.organizationId,
    input.productUrl,
  ).catch(() => null);
  if (!view) throw new SupplierMailRequestDeniedError();

  const body = view.communication.translatedMessage.trim();
  const subject = `TEST / DEMO — ${view.subject}`.slice(0, 450);
  const finalBody = `TEST / DEMO — Simulated inquiry for JAKOV360 software testing. NOT a real order.\n\n${body}`;
  const hash = gmailMailContentHash({
    sender: connection.emailAddress,
    recipient: input.recipient,
    subject,
    body: finalBody,
  });
  const existing = await prisma.supplierMailOutbound.count({
    where: { organizationId: context.organizationId, confirmationId: view.id },
  });
  const decision = checkSupplierMailSendIntent({
    organizationId: context.organizationId,
    confirmationOrganizationId: context.organizationId,
    mailboxOrganizationId: connection.organizationId,
    connectedMailboxAddress: connection.emailAddress,
    selectedFromAddress: connection.emailAddress,
    recipientAddress: input.recipient,
    confirmationStatus: view.record.status,
    connectionActive: connection.disconnectedAt === null,
    confirmationAlreadySent: existing > 0,
    userApprovedSend: true,
    approvedContentHash: hash,
    currentContentHash: hash,
    sourceAndTranslationCurrent: Boolean(
      view.communication.translationCurrent &&
      view.communication.targetLanguage &&
      body,
    ),
  });
  if (!decision.allowed) {
    if (decision.reason === "ALREADY_SENT") throw new SupplierMailAlreadyReservedError();
    throw new SupplierMailRequestDeniedError();
  }
  return { connection, view, subject, body: finalBody, contentHash: hash };
}

/** Read-only preview; tokens are sealed and expire without database mutation. */
export async function previewSupplierMail(
  context: AuthContext,
  input: { projectId: string; productUrl: string; connectionId: string; recipient: string },
) {
  const draft = await currentGmailDraft(context, input);
  const proof: PreviewProof = {
    organizationId: context.organizationId,
    userId: context.userId,
    projectId: input.projectId,
    confirmationId: draft.view.id,
    connectionId: draft.connection.id,
    recipient: input.recipient.trim().toLowerCase(),
    hash: draft.contentHash,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  };
  return {
    from: draft.connection.emailAddress,
    to: proof.recipient,
    subject: draft.subject,
    body: draft.body,
    contentHash: draft.contentHash,
    approvalToken: encryptMailboxJson(proof, GMAIL_PROOF_AAD),
  };
}

/**
 * Exactly one send attempt per supplier confirmation. Create an immutable
 * reservation BEFORE the provider call. Ambiguous outcomes stay UNKNOWN and
 * never trigger an automatic retry, even if an HTTP request is repeated.
 */
export async function sendApprovedSupplierMail(
  context: AuthContext,
  input: { projectId: string; productUrl: string; approvalToken: string; approved: boolean },
) {
  if (input.approved !== true) throw new SupplierMailRequestDeniedError();
  let proof: PreviewProof;
  try {
    proof = decryptMailboxJson<PreviewProof>(input.approvalToken, GMAIL_PROOF_AAD);
  } catch {
    throw new SupplierMailRequestDeniedError();
  }
  if (
    proof.organizationId !== context.organizationId ||
    proof.userId !== context.userId ||
    proof.projectId !== input.projectId ||
    !proof.connectionId ||
    !proof.recipient ||
    !proof.confirmationId ||
    !proof.hash ||
    !Number.isSafeInteger(proof.expiresAt) ||
    proof.expiresAt < Date.now()
  ) {
    throw new SupplierMailRequestDeniedError();
  }

  const draft = await currentGmailDraft(context, {
    projectId: input.projectId,
    productUrl: input.productUrl,
    connectionId: proof.connectionId,
    recipient: proof.recipient,
  });
  if (draft.view.id !== proof.confirmationId || draft.contentHash !== proof.hash) {
    throw new SupplierMailRequestDeniedError();
  }

  const rfcMessageId = createGmailMessageId();
  const raw = buildGmailRawMessage({
    from: draft.connection.emailAddress,
    to: proof.recipient,
    subject: draft.subject,
    body: draft.body,
    rfcMessageId,
  });

  let sendId: string;
  try {
    const reserved = await prisma.supplierMailOutbound.create({
      data: {
        id: randomUUID(),
        organizationId: context.organizationId,
        confirmationId: draft.view.id,
        mailboxConnectionId: draft.connection.id,
        fromAddress: draft.connection.emailAddress,
        recipientAddress: proof.recipient,
        subject: draft.subject,
        contentHash: draft.contentHash,
        rfcMessageId,
        status: "SENDING",
      },
      select: { id: true },
    });
    sendId = reserved.id;
  } catch {
    // Unique (tenant, confirmation) blocks retries after duplicate requests,
    // timeouts and concurrent browser clicks.
    throw new SupplierMailAlreadyReservedError();
  }

  try {
    const encrypted = draft.connection.encryptedRefreshToken;
    if (!encrypted) throw new SupplierMailUnavailableError();
    const refreshToken = decryptMailboxSecret(
      encrypted,
      `mailbox:${context.organizationId}:${draft.connection.id}`,
    );
    const config = gmailOAuthConfig();
    const accessToken = await refreshGmailAccessToken(refreshToken, config);
    const delivered = await sendGmailMessage(accessToken, raw);
    await prisma.$transaction(async (tx) => {
      await tx.supplierMailOutbound.update({
        where: { id: sendId },
        data: {
          status: "SENT",
          providerMessageId: delivered.providerMessageId,
          providerThreadId: delivered.providerThreadId,
          sentAt: new Date(),
        },
      });
      const updated = await tx.supplierConfirmation.updateMany({
        where: {
          id: draft.view.id,
          organizationId: context.organizationId,
          status: "PREPARED",
        },
        data: { status: "SENT" },
      });
      if (updated.count !== 1) throw new SupplierMailDeliveryUncertainError();
    });

    return {
      status: "SENT" as const,
      sendId,
      confirmationId: draft.view.id,
      // Do not expose OAuth tokens or raw provider headers to the UI.
    };
  } catch {
    await prisma.supplierMailOutbound.updateMany({
      where: { id: sendId, status: "SENDING" },
      data: { status: "UNKNOWN" },
    }).catch(() => undefined);
    throw new SupplierMailDeliveryUncertainError();
  }
}

export async function listConnectedGmailMailboxes(context: AuthContext) {
  if (!gmailAcceptanceEnabled(context.organizationId)) return [];
  const connections = await prisma.mailboxConnection.findMany({
    where: {
      organizationId: context.organizationId,
      userId: context.userId,
      provider: "GMAIL",
      disconnectedAt: null,
      encryptedRefreshToken: { not: null },
    },
    select: { id: true, emailAddress: true, connectedAt: true },
  });
  return connections;
}

export async function storeConnectedGmailMailbox(
  context: AuthContext,
  input: { email: string; refreshToken: string },
) {
  if (!gmailAcceptanceEnabled(context.organizationId)) {
    throw new SupplierMailUnavailableError();
  }
  const emailAddress = input.email.trim().toLowerCase();
  const existing = await prisma.mailboxConnection.findUnique({
    where: {
      organizationId_provider_emailAddress: {
        organizationId: context.organizationId,
        provider: "GMAIL",
        emailAddress,
      },
    },
  });
  if (existing && existing.userId !== context.userId) {
    throw new SupplierMailRequestDeniedError();
  }
  const id = existing?.id ?? randomUUID();
  const secret = encryptMailboxSecret(
    input.refreshToken,
    `mailbox:${context.organizationId}:${id}`,
  );
  if (existing) {
    await prisma.mailboxConnection.update({
      where: { id, organizationId: context.organizationId },
      data: {
        encryptedRefreshToken: secret.ciphertext,
        tokenKeyVersion: secret.version,
        disconnectedAt: null,
        connectedAt: new Date(),
      },
    });
  } else {
    await prisma.mailboxConnection.create({
      data: {
        id,
        organizationId: context.organizationId,
        userId: context.userId,
        provider: "GMAIL",
        emailAddress,
        encryptedRefreshToken: secret.ciphertext,
        tokenKeyVersion: secret.version,
      },
    });
  }
  return { id, emailAddress };
}

export async function disconnectGmailMailbox(
  context: AuthContext,
  connectionId: string,
): Promise<{ disconnected: true; providerRevocationConfirmed: boolean }> {
  if (!gmailAcceptanceEnabled(context.organizationId)) {
    throw new SupplierMailUnavailableError();
  }
  const connection = await prisma.mailboxConnection.findFirst({
    where: {
      id: connectionId,
      organizationId: context.organizationId,
      userId: context.userId,
      provider: "GMAIL",
      disconnectedAt: null,
    },
  });
  if (!connection) throw new SupplierMailRequestDeniedError();
  const inFlight = await prisma.supplierMailOutbound.count({
    where: {
      mailboxConnectionId: connection.id,
      organizationId: context.organizationId,
      status: "SENDING",
    },
  });
  if (inFlight) throw new SupplierMailRequestDeniedError();

  let providerRevocationConfirmed = false;
  if (connection.encryptedRefreshToken) {
    try {
      const token = decryptMailboxSecret(
        connection.encryptedRefreshToken,
        `mailbox:${context.organizationId}:${connection.id}`,
      );
      providerRevocationConfirmed = await revokeGmailToken(token);
    } catch {
      // Local credentials are invalidated regardless of provider response.
    }
  }
  await prisma.mailboxConnection.update({
    where: { id: connection.id },
    data: {
      encryptedRefreshToken: null,
      tokenKeyVersion: null,
      disconnectedAt: new Date(),
    },
  });
  return { disconnected: true, providerRevocationConfirmed };
}
