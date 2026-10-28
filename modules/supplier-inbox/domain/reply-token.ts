import { createHash, randomBytes } from "node:crypto";

/** 256-bit token. The floor for this design is 128 bits. */
export const REPLY_TOKEN_BYTES = 32;

/** Placeholder only. No MX or DNS name is published by this milestone. */
export const SYNTHETIC_REPLY_DOMAIN = "replies.example.test";

export function generateReplyToken(): string {
  return randomBytes(REPLY_TOKEN_BYTES).toString("base64url");
}

export function hashReplyToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function replyToAddress(token: string): string {
  return `r.${token}@${SYNTHETIC_REPLY_DOMAIN}`;
}

export function parseReplyRecipient(recipient: string): string | null {
  const localPart = recipient.trim().split("@")[0] ?? "";
  if (!localPart.startsWith("r.")) return null;
  const token = localPart.slice(2);
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) return null;
  return token;
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
