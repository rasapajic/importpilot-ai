import { prisma } from "@/lib/database/prisma";
import { canDownloadAttachment } from "@/modules/supplier-inbox/domain/attachment-policy";
import { quoteConfirmationDecision } from "@/modules/supplier-inbox/domain/confirmation-policy";
import { AttachmentDownloadBlockedError, SupplierInboxNotFoundError } from "@/modules/supplier-inbox/domain/errors";
import { isInboundMailEnabled } from "@/modules/supplier-inbox/domain/feature-flag";
import { FIXTURE_EXTRACTOR_MODEL_ID } from "@/modules/supplier-inbox/domain/quote-extraction";
import type { InboxThreadDto, ProjectInboxDto } from "@/modules/supplier-inbox/domain/types";

function eventSummary(metadata: unknown, type: string): string {
  if (metadata && typeof metadata === "object" && "summary" in metadata && typeof metadata.summary === "string") {
    return metadata.summary;
  }
  return type;
}

export async function getProjectSupplierInbox(
  projectId: string,
  organizationId: string,
): Promise<ProjectInboxDto | null> {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) return null;

  const threads = await prisma.supplierInboxThread.findMany({
    where: { projectId, organizationId },
    orderBy: { createdAt: "asc" },
    include: {
      inboundMessages: {
        where: { organizationId },
        orderBy: { receivedAt: "asc" },
        include: {
          translations: { where: { locale: "sr", organizationId } },
          attachments: {
            where: { organizationId },
            select: {
              id: true,
              filename: true,
              declaredMime: true,
              detectedMime: true,
              sizeBytes: true,
              sha256: true,
              scanStatus: true,
              rejectionReason: true,
            },
          },
          quoteExtractions: {
            where: { organizationId },
            orderBy: { fieldKey: "asc" },
            include: { citationAttachment: { select: { filename: true } } },
          },
        },
      },
      outboundMessages: {
        where: { organizationId, kind: "FOLLOW_UP" },
        orderBy: { createdAt: "asc" },
      },
      events: {
        where: { organizationId },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const dtoThreads: InboxThreadDto[] = threads.map((thread) => {
    const fields = thread.inboundMessages.flatMap((message) => message.quoteExtractions);
    const senderTrust = thread.inboundMessages.some((message) => message.senderTrust === "UNVERIFIED")
      ? "UNVERIFIED"
      : thread.inboundMessages[0]?.senderTrust ?? null;
    const decision = quoteConfirmationDecision({
      fields,
      senderTrust,
      unverifiedSenderAcknowledged: thread.unverifiedSenderAcknowledged,
    });
    return {
      id: thread.id,
      supplierName: thread.supplierName,
      status: thread.status,
      orderedQuantity: thread.orderedQuantity,
      ingestionDelayed: thread.ingestionDelayed,
      unverifiedSenderAcknowledged: thread.unverifiedSenderAcknowledged,
      confirmAllowed: decision.allowed,
      confirmBlockedReason: decision.reason,
      appliedToCostEngine: false,
      commercialOrderPlaced: false,
      extractorModelId: FIXTURE_EXTRACTOR_MODEL_ID,
      messages: thread.inboundMessages.map((message) => ({
        id: message.id,
        fromAddress: message.fromAddress,
        subject: message.subject,
        receivedAt: message.receivedAt.toISOString(),
        senderTrust: message.senderTrust ?? "UNVERIFIED",
        source: message.source,
        originalText: message.originalText,
        serbianText: message.translations[0]?.translatedText ?? "",
        translationModelId: message.translations[0]?.modelId ?? "",
        attachments: message.attachments.map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          declaredMime: attachment.declaredMime,
          detectedMime: attachment.detectedMime,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          scanStatus: attachment.scanStatus,
          rejectionReason: attachment.rejectionReason,
          downloadAllowed: canDownloadAttachment(attachment.scanStatus),
        })),
        extractions: message.quoteExtractions.map((extraction) => ({
          id: extraction.id,
          fieldKey: extraction.fieldKey,
          value: extraction.valueJson,
          confidence: extraction.confidence.toString(),
          snippet: extraction.citationSnippet,
          attachmentFilename: extraction.citationAttachment?.filename ?? null,
          page: extraction.citationPage,
          flag: extraction.flag,
          reviewStatus: extraction.reviewStatus,
        })),
      })),
      followUps: thread.outboundMessages.map((message) => ({
        id: message.id,
        status: message.status,
        subject: message.subject,
        body: message.body,
        sentAt: message.sentAt?.toISOString() ?? null,
        approvalHash: message.approvalHash,
      })),
      events: thread.events.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt.toISOString(),
        summary: eventSummary(event.metadata, event.type),
      })),
    };
  });

  return {
    projectId,
    receivingEnabled: isInboundMailEnabled(),
    threads: dtoThreads,
  };
}

export async function readCleanAttachment(input: {
  attachmentId: string;
  organizationId: string;
  projectId: string;
}): Promise<{ filename: string; mime: string; bytes: Uint8Array }> {
  const attachment = await prisma.supplierInboundAttachment.findFirst({
    where: {
      id: input.attachmentId,
      organizationId: input.organizationId,
      message: {
        organizationId: input.organizationId,
        thread: { projectId: input.projectId, organizationId: input.organizationId },
      },
    },
  });
  if (!attachment) throw new SupplierInboxNotFoundError();
  if (!canDownloadAttachment(attachment.scanStatus) || !attachment.content) {
    throw new AttachmentDownloadBlockedError();
  }
  return {
    filename: attachment.filename,
    mime: attachment.detectedMime,
    bytes: new Uint8Array(attachment.content),
  };
}
