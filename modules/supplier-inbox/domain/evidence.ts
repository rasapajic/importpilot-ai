import { redactSecrets, sha256Hex } from "@/modules/supplier-inbox/domain/reply-token";

/**
 * Redacted synthetic snapshot. This is not byte-for-byte SMTP evidence.
 * A future provider-original archive is a separate object and is not written here.
 */
export const REDACTED_SYNTHETIC_EVIDENCE_CLASS = "REDACTED_SYNTHETIC_SNAPSHOT";

export const REDACTED_SYNTHETIC_OBJECT_PREFIX = "db:supplier-inbox/synthetic-redacted/";

export type RedactedSyntheticSnapshotInput = {
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  receivedAt: string;
  providerMessageId: string;
  inReplyTo?: string | null;
  references?: string[];
  textBody: string;
  htmlBody?: string | null;
  rawAuthenticationResults?: string | null;
  configuredInboundDomain: boolean;
};

export function buildRedactedSyntheticSnapshot(
  input: RedactedSyntheticSnapshotInput,
  secrets: readonly string[],
): { json: string; sha256: string; key: string } {
  const json = redactSecrets(JSON.stringify({
    evidenceClass: REDACTED_SYNTHETIC_EVIDENCE_CLASS,
    byteForByteSmtp: false,
    providerOriginalRetained: false,
    configuredInboundDomain: input.configuredInboundDomain,
    from: input.fromAddress,
    toHeader: input.toAddresses,
    subject: input.subject,
    receivedAt: input.receivedAt,
    providerMessageId: input.providerMessageId,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? [],
    text: input.textBody,
    html: input.htmlBody ?? null,
    untrustedAuthenticationResultsHeader: input.rawAuthenticationResults ?? null,
  }), secrets);
  const sha256 = sha256Hex(json);
  return {
    json,
    sha256,
    key: `${REDACTED_SYNTHETIC_OBJECT_PREFIX}${sha256}`,
  };
}
