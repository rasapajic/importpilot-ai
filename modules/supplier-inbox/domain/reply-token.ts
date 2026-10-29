import { createHash, randomBytes } from "node:crypto";

/** 256-bit token. The floor for this design is 128 bits. */
export const REPLY_TOKEN_BYTES = 32;

/**
 * Placeholder only. No MX or DNS name is published by this milestone.
 * Routing accepts this domain alone. A later webhook must pass the
 * explicitly approved inbound subdomain, not a domain taken from the message.
 */
export const SYNTHETIC_REPLY_DOMAIN = "replies.example.test";

const REPLY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

export function generateReplyToken(): string {
  return randomBytes(REPLY_TOKEN_BYTES).toString("base64url");
}

export function hashReplyToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function replyToAddress(token: string): string {
  return `r.${token}@${SYNTHETIC_REPLY_DOMAIN}`;
}

/**
 * Accepts only a bare SMTP envelope recipient on the configured inbound domain.
 * A display name, angle address, suffix, or any other domain returns null.
 * The local-part token is not authentication.
 */
export function parseReplyRecipient(
  recipient: string,
  allowedDomain: string = SYNTHETIC_REPLY_DOMAIN,
): string | null {
  const parts = bareRecipientParts(recipient);
  if (!parts) return null;
  if (parts.domain.toLowerCase() !== allowedDomain.toLowerCase()) return null;
  if (!parts.localPart.startsWith("r.")) return null;
  const token = parts.localPart.slice(2);
  if (!REPLY_TOKEN_PATTERN.test(token)) return null;
  return token;
}

/** Why a recipient was rejected. Null means parseReplyRecipient accepted it. */
export function replyRecipientRejection(
  recipient: string,
  allowedDomain: string = SYNTHETIC_REPLY_DOMAIN,
): "UNCONFIGURED_DOMAIN" | "MALFORMED" | null {
  if (parseReplyRecipient(recipient, allowedDomain)) return null;
  const parts = bareRecipientParts(recipient);
  if (!parts) return "MALFORMED";
  if (parts.domain.toLowerCase() !== allowedDomain.toLowerCase()) return "UNCONFIGURED_DOMAIN";
  return "MALFORMED";
}

/**
 * Token-shaped local part from an untrusted recipient, including a wrong domain.
 * Used only to redact. Never used to look up a thread.
 */
export function untrustedReplyTokenCandidate(recipient: string): string | null {
  const trimmed = recipient.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  let localPart = trimmed.slice(0, at).trim();
  const angle = localPart.lastIndexOf("<");
  if (angle >= 0) localPart = localPart.slice(angle + 1).trim();
  if (!localPart.startsWith("r.")) return null;
  const token = localPart.slice(2);
  if (!REPLY_TOKEN_PATTERN.test(token)) return null;
  return token;
}

function bareRecipientParts(recipient: string): { localPart: string; domain: string } | null {
  const trimmed = recipient.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  if (/[\s<>"]/.test(trimmed)) return null;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const localPart = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  return { localPart, domain };
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  let output = value;
  for (const secret of secrets) {
    if (secret.length < 16) continue;
    output = output.split(secret).join("[redacted]");
  }
  return output.replace(/r\.[A-Za-z0-9_-]{22,}@/g, "r.[redacted]@");
}

export function sha256Hex(value: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof value === "string") hash.update(value, "utf8");
  else hash.update(value);
  return hash.digest("hex");
}
