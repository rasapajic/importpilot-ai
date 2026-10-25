import { createHash } from "node:crypto";

/**
 * Canonical approval fingerprint. Binds the exact reviewed draft to the
 * tenant, supplier confirmation, selected Gmail mailbox, sender and recipient.
 * The client cannot choose or override the actual message body sent by Gmail.
 */
export function supplierMailApprovalHash(input: {
  organizationId: string;
  confirmationId: string;
  mailboxConnectionId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  return createHash("sha256").update(JSON.stringify([
    "JAKOV360_SUPPLIER_MAIL_V1",
    input.organizationId,
    input.confirmationId,
    input.mailboxConnectionId,
    input.from.trim().toLowerCase(),
    input.to.trim().toLowerCase(),
    input.subject.trim(),
    input.body.trim(),
  ])).digest("hex");
}

export function isStagingSupplierMailRecipient(
  recipient: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = recipient.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 320 ||
    /[\r\n\s<>]/.test(normalized) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(normalized)
  ) return false;

  // An empty allowlist is a hard stop, even if mailbox OAuth is enabled.
  const allowlist = (env.JAKOV360_GMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.length > 0 && allowlist.includes(normalized);
}
