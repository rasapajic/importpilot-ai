/**
 * Pure, fail-closed preflight rules for the future Gmail/Outlook integration.
 *
 * These functions DO NOT send mail, read a mailbox, verify a sender's identity,
 * or confirm commercial terms. They must be invoked behind authenticated,
 * tenant-scoped service and database operations.
 */

export type SupplierMailProvider = "GMAIL" | "OUTLOOK";

export type SupplierMailSendIntent = {
  organizationId: string;
  confirmationOrganizationId: string;
  mailboxOrganizationId: string;
  connectedMailboxAddress: string;
  selectedFromAddress: string;
  recipientAddress: string;
  confirmationStatus: "FOUND" | "PREPARED" | "SENT" | "RESPONSE_RECEIVED" | "DOCUMENTED";
  connectionActive: boolean;
  confirmationAlreadySent: boolean;
  userApprovedSend: boolean;
  // SHA-256 of the canonical recipient, sender, subject and complete body.
  approvedContentHash: string | null;
  currentContentHash: string;
  sourceAndTranslationCurrent: boolean;
};

export type SupplierMailSendDenial =
  | "TENANT_MISMATCH"
  | "MAILBOX_NOT_CONNECTED"
  | "MAILBOX_SENDER_MISMATCH"
  | "INVALID_RECIPIENT"
  | "NOT_PREPARED"
  | "ALREADY_SENT"
  | "CONTENT_NOT_CURRENT"
  | "APPROVAL_REQUIRED";

export type SupplierMailSendDecision =
  | { allowed: true }
  | { allowed: false; reason: SupplierMailSendDenial };

function emailKey(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length > 320 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(trimmed)
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function checkSupplierMailSendIntent(
  input: SupplierMailSendIntent,
): SupplierMailSendDecision {
  if (
    !input.organizationId ||
    input.organizationId !== input.confirmationOrganizationId ||
    input.organizationId !== input.mailboxOrganizationId
  ) {
    return { allowed: false, reason: "TENANT_MISMATCH" };
  }
  if (!input.connectionActive) return { allowed: false, reason: "MAILBOX_NOT_CONNECTED" };

  const mailbox = emailKey(input.connectedMailboxAddress);
  const from = emailKey(input.selectedFromAddress);
  if (!mailbox || !from || mailbox !== from) {
    return { allowed: false, reason: "MAILBOX_SENDER_MISMATCH" };
  }
  const recipient = emailKey(input.recipientAddress);
  if (!recipient || recipient === mailbox) {
    return { allowed: false, reason: "INVALID_RECIPIENT" };
  }
  if (input.confirmationAlreadySent) return { allowed: false, reason: "ALREADY_SENT" };
  if (input.confirmationStatus !== "PREPARED") {
    return { allowed: false, reason: "NOT_PREPARED" };
  }
  if (!input.sourceAndTranslationCurrent) {
    return { allowed: false, reason: "CONTENT_NOT_CURRENT" };
  }
  if (
    !input.userApprovedSend ||
    !input.approvedContentHash ||
    !isSha256(input.approvedContentHash) ||
    !isSha256(input.currentContentHash) ||
    input.approvedContentHash !== input.currentContentHash
  ) {
    return { allowed: false, reason: "APPROVAL_REQUIRED" };
  }
  return { allowed: true };
}

export type SentSupplierMailEvidence = {
  organizationId: string;
  confirmationId: string;
  provider: SupplierMailProvider;
  connectedMailboxAddress: string;
  supplierRecipientAddress: string;
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
};

export type IncomingSupplierMail = {
  organizationId: string;
  provider: SupplierMailProvider;
  connectedMailboxAddress: string;
  fromAddress: string;
  toAddresses: readonly string[];
  providerMessageId: string;
  providerThreadId: string;
  inReplyTo: string | null;
  references: readonly string[];
};

export type SupplierMailMatchFailure =
  | "TENANT_MISMATCH"
  | "MAILBOX_MISMATCH"
  | "PROVIDER_MISMATCH"
  | "INVALID_HEADERS"
  | "THREAD_MISMATCH"
  | "UNEXPECTED_SENDER"
  | "WRONG_RECIPIENT"
  | "MISSING_REPLY_CHAIN";

export type SupplierMailReplyDecision =
  | { matched: true; confirmationId: string }
  | { matched: false; reason: SupplierMailMatchFailure };

function messageId(value: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  const stripped = raw.startsWith("<") && raw.endsWith(">")
    ? raw.slice(1, -1)
    : raw;
  if (
    stripped.length < 3 ||
    stripped.length > 255 ||
    !stripped.includes("@") ||
    /[\s<>\r\n]/.test(stripped)
  ) {
    return null;
  }
  // RFC Message-ID values are compared as opaque IDs, not as email addresses.
  return stripped;
}

function referencedMessageIds(values: readonly string[]): string[] {
  return values.flatMap((value) => {
    // RFC References may arrive as either one header or split header values.
    const identifiers = value.match(/<[^<>\s]+@[^<>\s]+>/g);
    return (identifiers ?? [value])
      .map((token) => messageId(token))
      .filter((token): token is string => token !== null);
  });
}

/**
 * Match only a candidate reply, never proof that a supplier or its commercial
 * terms are genuine. Email headers can be forged. Final verification is human.
 */
export function matchSupplierMailReply(
  sent: SentSupplierMailEvidence,
  incoming: IncomingSupplierMail,
): SupplierMailReplyDecision {
  if (
    !sent.organizationId ||
    sent.organizationId !== incoming.organizationId ||
    !sent.confirmationId
  ) {
    return { matched: false, reason: "TENANT_MISMATCH" };
  }
  if (sent.provider !== incoming.provider) {
    return { matched: false, reason: "PROVIDER_MISMATCH" };
  }
  const mailbox = emailKey(sent.connectedMailboxAddress);
  if (!mailbox || mailbox !== emailKey(incoming.connectedMailboxAddress)) {
    return { matched: false, reason: "MAILBOX_MISMATCH" };
  }
  const originalMessageId = messageId(sent.rfcMessageId);
  if (
    !sent.providerMessageId.trim() ||
    !incoming.providerMessageId.trim() ||
    !originalMessageId
  ) {
    return { matched: false, reason: "INVALID_HEADERS" };
  }
  if (
    !sent.providerThreadId.trim() ||
    !incoming.providerThreadId.trim() ||
    sent.providerThreadId !== incoming.providerThreadId
  ) {
    return { matched: false, reason: "THREAD_MISMATCH" };
  }
  const expectedSender = emailKey(sent.supplierRecipientAddress);
  if (!expectedSender || emailKey(incoming.fromAddress) !== expectedSender) {
    return { matched: false, reason: "UNEXPECTED_SENDER" };
  }
  if (!incoming.toAddresses.some((address) => emailKey(address) === mailbox)) {
    return { matched: false, reason: "WRONG_RECIPIENT" };
  }
  const references = [
    ...referencedMessageIds(incoming.references),
    ...referencedMessageIds(incoming.inReplyTo ? [incoming.inReplyTo] : []),
  ];
  if (!references.includes(originalMessageId)) {
    return { matched: false, reason: "MISSING_REPLY_CHAIN" };
  }
  return { matched: true, confirmationId: sent.confirmationId };
}
