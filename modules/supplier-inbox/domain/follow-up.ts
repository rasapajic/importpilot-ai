import { sha256Hex } from "@/modules/supplier-inbox/domain/reply-token";
import { ApprovalReuseError, FollowUpNotApprovedError } from "@/modules/supplier-inbox/domain/errors";

export function outboundContentHash(input: {
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  replyTokenHash: string;
}): string {
  return sha256Hex(JSON.stringify([
    input.fromAddress.trim().toLowerCase(),
    input.toAddress.trim().toLowerCase(),
    input.subject,
    input.body,
    input.replyTokenHash,
  ]));
}

export function buildClarificationFollowUp(input: {
  supplierName: string;
  fromAddress: string;
  toAddress: string;
  replyTokenHash: string;
  conflicts: string[];
}): { subject: string; body: string; contentHash: string } {
  const subject = "Clarification needed before the quote can be reviewed";
  const body = [
    `Hello ${input.supplierName},`,
    "",
    "This message is not an order and it does not accept a quotation.",
    "Please confirm these points in one written reply:",
    ...input.conflicts.map((conflict) => `- ${conflict}`),
    "",
    "Please restate the price for the exact ordered quantity, the full price tiers, currency, model, diopter mix, MOQ, Incoterm and named place, lead time, packaging, country of origin, certificates, quote validity, and payment terms.",
    "Reply to the JAKOV360 reply address on this thread. Do not treat this draft as sent.",
  ].join("\n");
  return {
    subject,
    body,
    contentHash: outboundContentHash({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject,
      body,
      replyTokenHash: input.replyTokenHash,
    }),
  };
}

export function assertFreshFollowUpApproval(input: {
  presentedHash: string;
  contentHash: string;
  approvalHash: string | null;
  rfqApprovalHash: string;
  status: string;
}): void {
  if (input.presentedHash === input.rfqApprovalHash) {
    throw new ApprovalReuseError();
  }
  if (
    input.status !== "APPROVED" ||
    input.approvalHash === null ||
    input.approvalHash !== input.contentHash ||
    input.presentedHash !== input.approvalHash
  ) {
    throw new FollowUpNotApprovedError();
  }
}
