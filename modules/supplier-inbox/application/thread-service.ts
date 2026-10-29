import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import {
  ApprovalReuseError,
  FollowUpNotApprovedError,
  SupplierInboxNotFoundError,
  SupplierInboxStateError,
} from "@/modules/supplier-inbox/domain/errors";
import { assertFreshFollowUpApproval, outboundContentHash } from "@/modules/supplier-inbox/domain/follow-up";
import type { InboxRequirement } from "@/modules/supplier-inbox/domain/quote-extraction";
import { generateReplyToken, hashReplyToken } from "@/modules/supplier-inbox/domain/reply-token";

const SYNTHETIC_OUTBOUND_PROVIDER = "synthetic";

async function requireProject(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new SupplierInboxNotFoundError();
  return project;
}

export async function openSupplierInboxThread(input: {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
  supplierName: string;
  expectedSupplierEmail: string;
  offerId?: string | null;
  orderedQuantity: number;
  requirement: InboxRequirement;
}): Promise<{ threadId: string; replyToken: string }> {
  await requireProject(input.projectId, input.organizationId);
  if (input.offerId) {
    const offer = await prisma.supplierOffer.findFirst({
      where: { id: input.offerId, organizationId: input.organizationId, projectId: input.projectId },
      select: { id: true },
    });
    if (!offer) throw new SupplierInboxNotFoundError();
  }

  const replyToken = generateReplyToken();
  const tokenHash = hashReplyToken(replyToken);
  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierInboxThread.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        offerId: input.offerId ?? null,
        supplierName: input.supplierName,
        status: "DRAFT",
        replyTokenHash: tokenHash,
        expectedSupplierEmail: input.expectedSupplierEmail,
        orderedQuantity: input.orderedQuantity,
        requirement: input.requirement as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId,
      },
    });
    await tx.supplierInboxReplyToken.create({
      data: {
        organizationId: input.organizationId,
        threadId: created.id,
        tokenHash,
        status: "ACTIVE",
      },
    });
    await tx.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: created.id,
        actorUserId: input.createdByUserId,
        type: "THREAD_OPENED",
        metadata: { summary: "Supplier thread opened. The reply token is stored only as a hash." },
      },
    });
    return created;
  });
  return { threadId: thread.id, replyToken };
}

export async function rotateReplyToken(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
}): Promise<{ replyToken: string }> {
  const replyToken = generateReplyToken();
  const tokenHash = hashReplyToken(replyToken);
  await prisma.$transaction(async (tx) => {
    const thread = await tx.supplierInboxThread.findFirst({
      where: { id: input.threadId, organizationId: input.organizationId, projectId: input.projectId },
      select: { id: true },
    });
    if (!thread) throw new SupplierInboxNotFoundError();
    await tx.supplierInboxReplyToken.updateMany({
      where: { threadId: thread.id, organizationId: input.organizationId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.supplierInboxReplyToken.create({
      data: {
        organizationId: input.organizationId,
        threadId: thread.id,
        tokenHash,
        status: "ACTIVE",
      },
    });
    await tx.supplierInboxThread.update({
      where: { id: thread.id },
      data: { replyTokenHash: tokenHash },
    });
  });
  return { replyToken };
}

export async function approveSyntheticRfq(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  authorUserId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
}): Promise<{ outboundId: string; approvalHash: string }> {
  const thread = await prisma.supplierInboxThread.findFirst({
    where: { id: input.threadId, organizationId: input.organizationId, projectId: input.projectId },
  });
  if (!thread) throw new SupplierInboxNotFoundError();
  const contentHash = outboundContentHash({
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    subject: input.subject,
    body: input.body,
    replyTokenHash: thread.replyTokenHash,
  });
  const existing = await prisma.supplierOutboundMessage.findFirst({
    where: { threadId: thread.id, organizationId: input.organizationId, kind: "RFQ" },
  });
  if (existing) {
    if (existing.contentHash !== contentHash) {
      throw new SupplierInboxStateError("The RFQ content no longer matches the stored approval.");
    }
    return { outboundId: existing.id, approvalHash: existing.approvalHash ?? contentHash };
  }
  if (thread.status !== "DRAFT") throw new SupplierInboxStateError("The thread is not waiting for RFQ approval.");

  const outbound = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierOutboundMessage.create({
      data: {
        organizationId: input.organizationId,
        threadId: thread.id,
        authorUserId: input.authorUserId,
        kind: "RFQ",
        status: "APPROVED",
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        replyTokenHash: thread.replyTokenHash,
        subject: input.subject,
        body: input.body,
        contentHash,
        approvalHash: contentHash,
        approvedAt: new Date(),
      },
    });
    await tx.supplierInboxThread.update({
      where: { id: thread.id },
      data: { status: "APPROVED" },
    });
    await tx.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: thread.id,
        actorUserId: input.authorUserId,
        type: "RFQ_APPROVED",
        metadata: { summary: "RFQ approved. It has not been sent.", outboundId: created.id },
      },
    });
    return created;
  });
  return { outboundId: outbound.id, approvalHash: contentHash };
}

export async function recordSyntheticRfqSent(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  evidence: { provider: string; providerMessageId: string };
}): Promise<{ outboundId: string }> {
  if (input.evidence.provider !== SYNTHETIC_OUTBOUND_PROVIDER || !input.evidence.providerMessageId) {
    throw new SupplierInboxStateError("Synthetic RFQ evidence is missing. No mail was sent.");
  }
  const outbound = await prisma.supplierOutboundMessage.findFirst({
    where: {
      threadId: input.threadId,
      organizationId: input.organizationId,
      kind: "RFQ",
      thread: { projectId: input.projectId, organizationId: input.organizationId },
    },
  });
  if (!outbound || outbound.status === "DRAFT" || !outbound.approvalHash) {
    throw new SupplierInboxStateError("The RFQ is not approved.");
  }
  if (outbound.status === "SENT") return { outboundId: outbound.id };

  await prisma.$transaction(async (tx) => {
    await tx.supplierOutboundMessage.update({
      where: { id: outbound.id },
      data: {
        status: "SENT",
        provider: SYNTHETIC_OUTBOUND_PROVIDER,
        providerMessageId: input.evidence.providerMessageId,
        sentAt: new Date(),
      },
    });
    await tx.supplierInboxThread.update({
      where: { id: input.threadId },
      data: { status: "SENT" },
    });
    await tx.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: input.threadId,
        type: "RFQ_SENT",
        metadata: {
          summary: "Synthetic RFQ evidence recorded. No email provider was contacted and no inbound row was created.",
          provider: SYNTHETIC_OUTBOUND_PROVIDER,
        },
      },
    });
  });
  return { outboundId: outbound.id };
}

export async function approveFollowUp(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  followUpId: string;
  presentedHash: string;
  approverUserId: string;
}): Promise<{ status: "APPROVED"; sentAt: null }> {
  const followUp = await prisma.supplierOutboundMessage.findFirst({
    where: {
      id: input.followUpId,
      threadId: input.threadId,
      organizationId: input.organizationId,
      kind: "FOLLOW_UP",
      thread: { projectId: input.projectId, organizationId: input.organizationId },
    },
  });
  const rfq = await prisma.supplierOutboundMessage.findFirst({
    where: { threadId: input.threadId, organizationId: input.organizationId, kind: "RFQ" },
  });
  if (!followUp || !rfq?.approvalHash) throw new SupplierInboxNotFoundError();
  if (input.presentedHash === rfq.approvalHash) throw new ApprovalReuseError();
  if (input.presentedHash !== followUp.contentHash) throw new FollowUpNotApprovedError();
  if (followUp.status === "APPROVED" && followUp.approvalHash === followUp.contentHash) {
    return { status: "APPROVED", sentAt: null };
  }
  await prisma.$transaction(async (tx) => {
    await tx.supplierOutboundMessage.update({
      where: { id: followUp.id },
      data: {
        status: "APPROVED",
        approvalHash: followUp.contentHash,
        approvedAt: new Date(),
      },
    });
    await tx.supplierInboxEvent.create({
      data: {
        organizationId: input.organizationId,
        threadId: input.threadId,
        actorUserId: input.approverUserId,
        type: "FOLLOW_UP_APPROVED",
        metadata: { summary: "Follow-up text approved. It was not sent.", followUpId: followUp.id },
      },
    });
  });
  return { status: "APPROVED", sentAt: null };
}

export async function sendFollowUp(input: {
  organizationId: string;
  projectId: string;
  threadId: string;
  followUpId: string;
  presentedHash: string;
}): Promise<{ sent: false; reason: "SYNTHETIC_MILESTONE_DOES_NOT_SEND" }> {
  const followUp = await prisma.supplierOutboundMessage.findFirst({
    where: {
      id: input.followUpId,
      threadId: input.threadId,
      organizationId: input.organizationId,
      kind: "FOLLOW_UP",
      thread: { projectId: input.projectId, organizationId: input.organizationId },
    },
  });
  const rfq = await prisma.supplierOutboundMessage.findFirst({
    where: { threadId: input.threadId, organizationId: input.organizationId, kind: "RFQ" },
  });
  if (!followUp || !rfq?.approvalHash) throw new SupplierInboxNotFoundError();
  assertFreshFollowUpApproval({
    presentedHash: input.presentedHash,
    contentHash: followUp.contentHash,
    approvalHash: followUp.approvalHash,
    rfqApprovalHash: rfq.approvalHash,
    status: followUp.status,
  });
  await prisma.supplierInboxEvent.create({
    data: {
      organizationId: input.organizationId,
      threadId: input.threadId,
      type: "FOLLOW_UP_SEND_BLOCKED",
      metadata: {
        summary: "Follow-up send blocked. This milestone has no outbound mail transport.",
        followUpId: followUp.id,
      },
    },
  });
  return { sent: false, reason: "SYNTHETIC_MILESTONE_DOES_NOT_SEND" };
}

export async function purgeExpiredQuarantine(now = new Date()): Promise<number> {
  const result = await prisma.supplierInboundMessage.deleteMany({
    where: {
      organizationId: null,
      quarantineReason: { not: null },
      retentionExpiresAt: { lte: now },
    },
  });
  return result.count;
}
