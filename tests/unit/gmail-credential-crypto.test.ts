import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  decryptGmailRefreshToken,
  encryptGmailRefreshToken,
  GmailCredentialConfigurationError,
} from "../../modules/negotiation/infrastructure/gmail-credential-crypto";

const previous = process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64;
afterEach(() => {
  if (previous === undefined) delete process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64;
  else process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = previous;
});

describe("Gmail OAuth token encryption", () => {
  it("encrypts with fresh authenticated nonce and decrypts only for the exact tenant and Google ID", () => {
    process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = randomBytes(32).toString("base64url");
    const token = "fake-oauth-refresh-token-For-Unit-Test";
    const a = encryptGmailRefreshToken(token, "org-1", "google-1");
    const b = encryptGmailRefreshToken(token, "org-1", "google-1");
    expect(a).not.toBe(b);
    expect(a).not.toContain(token);
    expect(a.startsWith("g1.")).toBe(true);
    expect(decryptGmailRefreshToken(a, "org-1", "google-1")).toBe(token);
    expect(() => decryptGmailRefreshToken(a, "org-2", "google-1")).toThrow();
    expect(() => decryptGmailRefreshToken(a, "org-1", "google-2")).toThrow();
    const parts = a.split(".");
    parts[2] = Buffer.from("forged-text").toString("base64url");
    expect(() => decryptGmailRefreshToken(parts.join("."), "org-1", "google-1")).toThrow();
  });

  it("rejects missing or weak keys without leaking tokens", () => {
    delete process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64;
    expect(() => encryptGmailRefreshToken("my-token", "org-1", "google-1")).toThrow(
      GmailCredentialConfigurationError,
    );
    process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = Buffer.alloc(8).toString("base64");
    expect(() => encryptGmailRefreshToken("my-token", "org-1", "google-1")).toThrow(
      GmailCredentialConfigurationError,
    );
  });
});
