import { prisma } from "@/lib/database/prisma";
import { quoteConfirmationDecision } from "@/modules/supplier-inbox/domain/confirmation-policy";
import { QuoteReviewError, SupplierInboxNotFoundError } from "@/modules/supplier-inbox/domain/errors";

const BLOCKING_FLAGS = new Set(["MISSING", "CONTRADICTION", "SPEC_MISMATCH", "LOW_CONFIDENCE"]);

async function requireExtraction(input: {
  organizationId: string;
  projectId: string;
  extractionId: string;
}) {
  const extraction = await prisma.supplierQuoteExtraction.findFirst({
    where: {
      id: input.extractionId,
      organizationId: input.organizationId,
      thread: { projectId: input.projectId, organizationId: input.organizationId },
    },
  });
  if (!extraction) throw new SupplierInboxNotFoundError();
  return extraction;
}

export async function reviewQuoteField(input: {
  organizationId: string;
  projectId: string;
  extractionId: string;
  reviewerUserId: string;
  decision: "ACCEPTED" | "REJECTED";
}): Promise<{ reviewStatus: "ACCEPTED" | "REJECTED"; appliedToCostEngine: false }> {
  const extraction = await requireExtraction(input);
  if (input.decision === "ACCEPTED" && extraction.fieldKey === "untrusted_instruction") {
    throw new QuoteReviewError("Instructions inside a supplier message cannot be accepted.");
  }
  if (input.decision === "ACCEPTED" && BLOCKING_FLAGS.has(extraction.flag)) {
    throw new QuoteReviewError("A conflicting, missing, or low-confidence field cannot be accepted.");
  }
  await prisma.$transaction([
    prisma.supplierQuoteExtraction.update({
      where: { id: extraction.id },
      data: {
        reviewStatus: input.decision,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
      },
    }),
    prisma.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: extraction.threadId,
        actorUserId: input.reviewerUserId,
        type: "FIELD_REVIEWED",
        metadata: {
          summary: `Field ${extraction.fieldKey} marked ${input.decision}. The landed cost was not changed.`,
          fieldKey: extraction.fieldKey,
          decision: input.decision,
          appliedToCostEngine: false,
        },
      },
    }),
  ]);
  return { reviewStatus: input.decision, appliedToCostEngine: false };
}

export async function acknowledgeUnverifiedSender(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  userId: string;
}): Promise<void> {
  const thread = await prisma.supplierInboxThread.findFirst({
    where: { id: input.threadId, organizationId: input.organizationId, projectId: input.projectId },
    select: { id: true },
  });
  if (!thread) throw new SupplierInboxNotFoundError();
  await prisma.$transaction([
    prisma.supplierInboxThread.update({
      where: { id: thread.id },
      data: { unverifiedSenderAcknowledged: true },
    }),
    prisma.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: thread.id,
        actorUserId: input.userId,
        type: "SENDER_ACKNOWLEDGED",
        metadata: { summary: "A person acknowledged the unverified sender. Quote fields were not accepted." },
      },
    }),
  ]);
}

export async function confirmWrittenQuote(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  userId: string;
}): Promise<{ status: "QUOTE_CONFIRMED"; appliedToCostEngine: false; commercialOrderPlaced: false }> {
  const thread = await prisma.supplierInboxThread.findFirst({
    where: { id: input.threadId, organizationId: input.organizationId, projectId: input.projectId },
    include: {
      quoteExtractions: { where: { organizationId: input.organizationId } },
      inboundMessages: { where: { organizationId: input.organizationId }, select: { senderTrust: true } },
    },
  });
  if (!thread) throw new SupplierInboxNotFoundError();
  const senderTrust = thread.inboundMessages.some((message) => message.senderTrust === "UNVERIFIED")
    ? "UNVERIFIED"
    : thread.inboundMessages[0]?.senderTrust ?? null;
  const decision = quoteConfirmationDecision({
    fields: thread.quoteExtractions,
    senderTrust,
    unverifiedSenderAcknowledged: thread.unverifiedSenderAcknowledged,
  });
  if (!decision.allowed) throw new QuoteReviewError(decision.reason ?? "The written quote cannot be confirmed.");

  await prisma.$transaction([
    prisma.supplierInboxThread.update({
      where: { id: thread.id },
      data: { status: "QUOTE_CONFIRMED" },
    }),
    prisma.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: thread.id,
        actorUserId: input.userId,
        type: "QUOTE_CONFIRMED",
        metadata: {
          summary: "A person confirmed the written evidence. This is not a purchase and the landed cost was not changed.",
          appliedToCostEngine: false,
          commercialOrderPlaced: false,
        },
      },
    }),
  ]);
  return { status: "QUOTE_CONFIRMED", appliedToCostEngine: false, commercialOrderPlaced: false };
}
