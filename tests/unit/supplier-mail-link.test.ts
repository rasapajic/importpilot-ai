import { describe, expect, it } from "vitest";

import {
  checkSupplierMailSendIntent,
  matchSupplierMailReply,
  type IncomingSupplierMail,
  type SentSupplierMailEvidence,
  type SupplierMailSendIntent,
} from "../../modules/negotiation/domain/supplier-mail-link";

const approvedHash = "a".repeat(64);

function readySend(overrides: Partial<SupplierMailSendIntent> = {}): SupplierMailSendIntent {
  return {
    organizationId: "org-a",
    confirmationOrganizationId: "org-a",
    mailboxOrganizationId: "org-a",
    connectedMailboxAddress: "Buyer@Example.COM",
    selectedFromAddress: "buyer@example.com",
    recipientAddress: "supplier@example.cn",
    confirmationStatus: "PREPARED",
    connectionActive: true,
    confirmationAlreadySent: false,
    userApprovedSend: true,
    approvedContentHash: approvedHash,
    currentContentHash: approvedHash,
    sourceAndTranslationCurrent: true,
    ...overrides,
  };
}

const sent: SentSupplierMailEvidence = {
  organizationId: "org-a",
  confirmationId: "confirmation-123",
  provider: "GMAIL",
  connectedMailboxAddress: "buyer@example.com",
  supplierRecipientAddress: "supplier@example.cn",
  providerMessageId: "gmail-sent-123",
  providerThreadId: "gmail-thread-abc",
  rfcMessageId: "<rfq-123@jakov360.test>",
};

function reply(overrides: Partial<IncomingSupplierMail> = {}): IncomingSupplierMail {
  return {
    organizationId: "org-a",
    provider: "GMAIL",
    connectedMailboxAddress: "BUYER@example.com",
    fromAddress: "supplier@example.cn",
    toAddresses: ["buyer@example.com"],
    providerMessageId: "gmail-reply-456",
    providerThreadId: "gmail-thread-abc",
    inReplyTo: "<rfq-123@jakov360.test>",
    references: [],
    ...overrides,
  };
}

describe("JAKOV360 connected-mail send guard", () => {
  it("requires a connected, tenant-scoped mailbox and approval of the exact message", () => {
    expect(checkSupplierMailSendIntent(readySend())).toEqual({ allowed: true });
  });

  it.each([
    [readySend({ organizationId: "org-b" }), "TENANT_MISMATCH"],
    [readySend({ confirmationOrganizationId: "org-b" }), "TENANT_MISMATCH"],
    [readySend({ mailboxOrganizationId: "org-b" }), "TENANT_MISMATCH"],
    [readySend({ connectionActive: false }), "MAILBOX_NOT_CONNECTED"],
    [readySend({ selectedFromAddress: "attacker@example.com" }), "MAILBOX_SENDER_MISMATCH"],
    [readySend({ recipientAddress: "not-an-email" }), "INVALID_RECIPIENT"],
    [readySend({ recipientAddress: "buyer@example.com" }), "INVALID_RECIPIENT"],
    [readySend({ confirmationStatus: "SENT" }), "NOT_PREPARED"],
    [readySend({ confirmationAlreadySent: true }), "ALREADY_SENT"],
    [readySend({ sourceAndTranslationCurrent: false }), "CONTENT_NOT_CURRENT"],
    [readySend({ userApprovedSend: false }), "APPROVAL_REQUIRED"],
    [readySend({ approvedContentHash: "b".repeat(64) }), "APPROVAL_REQUIRED"],
    [readySend({ approvedContentHash: "not-a-hash" }), "APPROVAL_REQUIRED"],
    [readySend({ currentContentHash: "not-a-hash" }), "APPROVAL_REQUIRED"],
  ] as const)("denies unsafe sends: %s", (input, reason) => {
    expect(checkSupplierMailSendIntent(input)).toEqual({ allowed: false, reason });
  });
});

describe("JAKOV360 supplier reply matching", () => {
  it("matches a reply with exact tenant, mailbox, thread, supplier and RFC reference", () => {
    expect(matchSupplierMailReply(sent, reply())).toEqual({
      matched: true,
      confirmationId: "confirmation-123",
    });
  });

  it("accepts multi-value References headers even without In-Reply-To", () => {
    expect(matchSupplierMailReply(
      sent,
      reply({
        inReplyTo: null,
        references: ["<older@example.test> <rfq-123@jakov360.test>"],
      }),
    )).toEqual({ matched: true, confirmationId: "confirmation-123" });
  });

  it.each([
    [reply({ organizationId: "org-b" }), "TENANT_MISMATCH"],
    [reply({ provider: "OUTLOOK" }), "PROVIDER_MISMATCH"],
    [reply({ connectedMailboxAddress: "another@example.com" }), "MAILBOX_MISMATCH"],
    [reply({ providerThreadId: "some-other-thread" }), "THREAD_MISMATCH"],
    [reply({ fromAddress: "intruder@example.cn" }), "UNEXPECTED_SENDER"],
    [reply({ toAddresses: ["different@example.com"] }), "WRONG_RECIPIENT"],
    [reply({ inReplyTo: null, references: [] }), "MISSING_REPLY_CHAIN"],
    [reply({ inReplyTo: "<unrelated@example.test>" }), "MISSING_REPLY_CHAIN"],
    [reply({ providerMessageId: "" }), "INVALID_HEADERS"],
  ] as const)("does not auto-match unrelated or ambiguous mail: %s", (inbound, reason) => {
    expect(matchSupplierMailReply(sent, inbound)).toEqual({ matched: false, reason });
  });

  it("rejects a message with a missing original provider identifier", () => {
    expect(matchSupplierMailReply({ ...sent, providerMessageId: "" }, reply()))
      .toEqual({ matched: false, reason: "INVALID_HEADERS" });
  });

  it("never relies on only a sender address or subject to link a message", () => {
    expect(matchSupplierMailReply(
      sent,
      reply({ inReplyTo: null, references: [], providerThreadId: "gmail-thread-abc" }),
    )).toEqual({ matched: false, reason: "MISSING_REPLY_CHAIN" });
  });
});
