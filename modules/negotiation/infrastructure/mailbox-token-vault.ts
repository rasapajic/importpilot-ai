import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Server-only AES-256-GCM envelope. No key material or plaintext token may be
 * passed to the browser, application logs, or the AI translator.
 *
 * Example env shape (not a real key):
 * JAKOV360_MAIL_TOKEN_KEYS_JSON={"v1":"<BASE64_32_RANDOM_BYTES>"}
 * JAKOV360_MAIL_ACTIVE_KEY_VERSION=v1
 */
type KeyConfig = { activeVersion: string; keys: Record<string, string> };

function keyConfiguration(env: Record<string, string | undefined>): KeyConfig {
  const version = env.JAKOV360_MAIL_ACTIVE_KEY_VERSION;
  let keys: unknown;
  try { keys = JSON.parse(env.JAKOV360_MAIL_TOKEN_KEYS_JSON || ""); } catch {
    throw new Error("MAIL_ENCRYPTION_NOT_CONFIGURED");
  }
  if (
    !version ||
    !/^[A-Za-z0-9_-]{1,24}$/.test(version) ||
    !keys ||
    typeof keys !== "object" ||
    Array.isArray(keys)
  ) {
    throw new Error("MAIL_ENCRYPTION_NOT_CONFIGURED");
  }
  return { activeVersion: version, keys: keys as Record<string, string> };
}

function keyFor(version: string, config: KeyConfig): Buffer {
  const raw = config.keys[version];
  if (!raw || typeof raw !== "string") throw new Error("MAIL_ENCRYPTION_KEY_UNAVAILABLE");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) {
    throw new Error("MAIL_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

export function encryptMailboxSecret(
  value: string,
  associatedData: string,
  env: Record<string, string | undefined> = process.env,
): { ciphertext: string; version: string } {
  if (!value || !associatedData) throw new Error("MAIL_ENCRYPTION_INVALID_INPUT");
  const config = keyConfiguration(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(config.activeVersion, config), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [
      config.activeVersion,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join("."),
    version: config.activeVersion,
  };
}

export function decryptMailboxSecret(
  ciphertext: string,
  associatedData: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (!associatedData) throw new Error("MAIL_ENCRYPTION_INVALID_INPUT");
  const parts = ciphertext.split(".");
  if (parts.length !== 4) throw new Error("MAIL_ENCRYPTION_INVALID_CIPHERTEXT");
  const [version, rawIv, rawTag, rawData] = parts;
  const config = keyConfiguration(env);
  const iv = Buffer.from(rawIv, "base64url");
  const tag = Buffer.from(rawTag, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("MAIL_ENCRYPTION_INVALID_CIPHERTEXT");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFor(version, config), iv);
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(rawData, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptMailboxJson(
  value: unknown,
  associatedData: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return encryptMailboxSecret(JSON.stringify(value), associatedData, env).ciphertext;
}

export function decryptMailboxJson<T>(
  ciphertext: string,
  associatedData: string,
  env: Record<string, string | undefined> = process.env,
): T {
  return JSON.parse(decryptMailboxSecret(ciphertext, associatedData, env)) as T;
}
