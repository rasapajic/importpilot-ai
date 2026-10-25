import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TOKEN_ENVELOPE_VERSION = "g1";
const AES_GCM_NONCE_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

export class GmailCredentialConfigurationError extends Error {
  constructor() {
    super("Gmail credential encryption has not been securely configured.");
    this.name = "GmailCredentialConfigurationError";
  }
}

function encryptionKeyFromEnvironment(): Buffer {
  const encoded = process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64?.trim();
  if (
    !encoded ||
    !/^(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9+/]{43}=)$/.test(encoded)
  ) {
    throw new GmailCredentialConfigurationError();
  }
  const key = Buffer.from(encoded, encoded.includes("+") || encoded.includes("/") || encoded.endsWith("=")
    ? "base64"
    : "base64url");
  if (key.length !== 32) throw new GmailCredentialConfigurationError();
  return key;
}

function credentialAad(organizationId: string, googleAccountId: string) {
  if (!organizationId || !googleAccountId || /[\r\n\0]/.test(organizationId + googleAccountId)) {
    throw new Error("Invalid Gmail credential context.");
  }
  return Buffer.from(`JAKOV360:GMAIL:${organizationId}:GOOGLE:${googleAccountId}`, "utf8");
}

/** Only for encrypting OAuth refresh tokens; never place keys or plaintext in logs. */
export function encryptGmailRefreshToken(
  refreshToken: string,
  organizationId: string,
  googleAccountId: string,
): string {
  if (!refreshToken.trim() || refreshToken.length > 16_384) {
    throw new Error("Invalid Gmail credential.");
  }
  const key = encryptionKeyFromEnvironment();
  const iv = randomBytes(AES_GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(credentialAad(organizationId, googleAccountId));
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return [
    TOKEN_ENVELOPE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function decryptGmailRefreshToken(
  sealedToken: string,
  organizationId: string,
  googleAccountId: string,
): string {
  const parts = sealedToken.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== TOKEN_ENVELOPE_VERSION ||
    !parts.slice(1).every((value) => /^[A-Za-z0-9_-]+$/.test(value))
  ) {
    throw new Error("Invalid stored Gmail credential.");
  }
  const [ , encodedIv, encodedText, encodedTag] = parts;
  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== AES_GCM_NONCE_BYTES || tag.length !== AES_GCM_TAG_BYTES) {
    throw new Error("Invalid stored Gmail credential.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKeyFromEnvironment(), iv);
  decipher.setAAD(credentialAad(organizationId, googleAccountId));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encodedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
