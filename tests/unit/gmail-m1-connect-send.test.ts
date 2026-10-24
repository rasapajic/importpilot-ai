import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  GMAIL_ACCEPTANCE_ORIGIN,
  gmailAcceptanceEnabled,
  gmailAcceptanceRecipientAllowed,
  gmailOAuthConfig,
  isTrustedGmailActionOrigin,
} from "../../modules/negotiation/infrastructure/gmail-acceptance-config";
import {
  buildGmailConnectUrl,
  createGmailConnectAttempt,
  exchangeGmailConnectCode,
  GMAIL_SEND_SCOPE,
  refreshGmailAccessToken,
  verifyGmailConnectAttempt,
} from "../../modules/negotiation/infrastructure/gmail-oauth";
import {
  buildGmailRawMessage,
  createGmailMessageId,
  sendGmailMessage,
} from "../../modules/negotiation/infrastructure/gmail-send";
import {
  decryptMailboxJson,
  decryptMailboxSecret,
  encryptMailboxJson,
  encryptMailboxSecret,
} from "../../modules/negotiation/infrastructure/mailbox-token-vault";

const mailboxKey = randomBytes(32).toString("base64");
const secondKey = randomBytes(32).toString("base64");
const vault = {
  JAKOV360_MAIL_ACTIVE_KEY_VERSION: "v1",
  JAKOV360_MAIL_TOKEN_KEYS_JSON: JSON.stringify({ v1: mailboxKey, v2: secondKey }),
};
const enabled = {
  RENDER_SERVICE_ID: "srv-datu3v093c1s73c17m60",
  JAKOV360_GMAIL_TEST_ENABLED: "1",
  JAKOV360_GMAIL_TEST_ORG_ID: "org-a",
  JAKOV360_GMAIL_TEST_RECIPIENT: "second@example.test",
};

describe("JAKOV360 Gmail M1 acceptance-only gating", () => {
  it("rejects production and other tenants even when test flags leak into env", () => {
    expect(gmailAcceptanceEnabled("org-a", enabled)).toBe(true);
    expect(gmailAcceptanceEnabled("org-b", enabled)).toBe(false);
    expect(gmailAcceptanceEnabled("org-a", { ...enabled, RENDER_SERVICE_ID: "prod" })).toBe(false);
    expect(gmailAcceptanceEnabled("org-a", { ...enabled, JAKOV360_GMAIL_TEST_ENABLED: "0" })).toBe(false);
    expect(gmailAcceptanceRecipientAllowed("second@EXAMPLE.test", enabled)).toBe(true);
    expect(gmailAcceptanceRecipientAllowed("supplier@example.cn", enabled)).toBe(false);
    expect(gmailAcceptanceRecipientAllowed("second@example.test", {
      ...enabled, JAKOV360_GMAIL_TEST_RECIPIENT: "",
    })).toBe(false);
    expect(isTrustedGmailActionOrigin(GMAIL_ACCEPTANCE_ORIGIN)).toBe(true);
    expect(isTrustedGmailActionOrigin("https://evil.test")).toBe(false);
    expect(isTrustedGmailActionOrigin(null)).toBe(false);
  });

  it("does not allow a custom remote OAuth callback", () => {
    expect(() => gmailOAuthConfig({
      GOOGLE_MAIL_CLIENT_ID: "client", GOOGLE_MAIL_CLIENT_SECRET: "secret",
      GOOGLE_MAIL_OAUTH_REDIRECT_URI: "https://evil.test/callback",
    })).toThrow();
  });
});

describe("encrypted Gmail connection secrets", () => {
  it("uses fresh nonces, authenticates tenant and mailbox IDs and supports key rotation", () => {
    const aad = "mailbox:org-a:conn-a";
    const first = encryptMailboxSecret("refresh-token-sample", aad, vault);
    const second = encryptMailboxSecret("refresh-token-sample", aad, vault);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
    expect(first.ciphertext).not.toContain("refresh-token-sample");
    expect(decryptMailboxSecret(first.ciphertext, aad, vault)).toBe("refresh-token-sample");
    expect(() => decryptMailboxSecret(first.ciphertext, "mailbox:org-b:conn-a", vault)).toThrow();
    const rotated = { ...vault, JAKOV360_MAIL_ACTIVE_KEY_VERSION: "v2" };
    expect(decryptMailboxSecret(first.ciphertext, aad, rotated)).toBe("refresh-token-sample");
    const newEnvelope = encryptMailboxSecret("new-token", aad, rotated);
    expect(newEnvelope.version).toBe("v2");
    expect(decryptMailboxSecret(newEnvelope.ciphertext, aad, rotated)).toBe("new-token");
    expect(() => decryptMailboxSecret(newEnvelope.ciphertext, aad, {
      ...vault,
      JAKOV360_MAIL_TOKEN_KEYS_JSON: JSON.stringify({ v1: mailboxKey }),
    })).toThrow();
  });

  it("encrypts the OAuth attempt and rejects tampered ciphertext", () => {
    const sealed = encryptMailboxJson({ state: "random" }, "oauth:gmail", vault);
    expect(decryptMailboxJson<{ state: string }>(sealed, "oauth:gmail", vault).state).toBe("random");
    expect(() => decryptMailboxJson(sealed.slice(0, -2) + "ff", "oauth:gmail", vault)).toThrow();
    expect(() => encryptMailboxSecret("secret", "tenant", {})).toThrow();
  });
});

describe("Gmail OAuth is separate from Google sign-in", () => {
  it("requires state, PKCE, offline access, owner identity binding and gmail.send only", () => {
    const attempt = createGmailConnectAttempt("user-1", "org-a", 1000);
    const url = new URL(buildGmailConnectUrl({
      clientId: "client",
      redirectUri: "https://jakov360-acceptance-staging.onrender.com/api/mail/gmail/callback",
    }, attempt));
    expect(url.searchParams.get("scope")?.split(" ")).toContain(GMAIL_SEND_SCOPE);
    expect(url.searchParams.get("scope")?.split(" ")).not.toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(verifyGmailConnectAttempt(attempt, attempt.state, {
      userId: "user-1", organizationId: "org-a",
    }, 2000)).toBe(true);
    expect(verifyGmailConnectAttempt(attempt, attempt.state, {
      userId: "user-2", organizationId: "org-a",
    }, 2000)).toBe(false);
    expect(verifyGmailConnectAttempt(attempt, attempt.state, {
      userId: "user-1", organizationId: "org-b",
    }, 2000)).toBe(false);
    expect(verifyGmailConnectAttempt(attempt, "wrong", {
      userId: "user-1", organizationId: "org-a",
    }, 2000)).toBe(false);
    expect(verifyGmailConnectAttempt(attempt, attempt.state, {
      userId: "user-1", organizationId: "org-a",
    }, 800_000)).toBe(false);
  });

  it("requires refresh token, granted send scope, and verified mailbox email", async () => {
    const requests: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      requests.push(String(url));
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "sample-access", refresh_token: "sample-refresh",
          scope: `openid email profile ${GMAIL_SEND_SCOPE}`,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        email: "Test@Example.COM", email_verified: true,
      }), { status: 200 });
    }) as typeof fetch;
    const grant = await exchangeGmailConnectCode("code", "verifier", {
      clientId: "client", clientSecret: "secret",
      redirectUri: "https://jakov360-acceptance-staging.onrender.com/api/mail/gmail/callback",
    }, fetcher);
    expect(grant).toEqual({
      accessToken: "sample-access",
      refreshToken: "sample-refresh",
      email: "test@example.com",
    });
    expect(requests).toHaveLength(2);
    const denied = (async () => new Response(JSON.stringify({
      access_token: "sample-access", refresh_token: "sample-refresh",
      scope: "openid email profile",
    }), { status: 200 })) as typeof fetch;
    await expect(exchangeGmailConnectCode("code", "verifier", {
      clientId: "client", clientSecret: "secret", redirectUri: "https://test/callback",
    }, denied)).rejects.toThrow("GMAIL_CONNECT_PERMISSION_MISSING");
  });

  it("refreshes short-lived access tokens without exposing refresh token in response", async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      access_token: "next-access",
    }), { status: 200 })) as typeof fetch;
    expect(await refreshGmailAccessToken("sample-refresh", {
      clientId: "client", clientSecret: "secret",
    }, fetcher)).toBe("next-access");
  });
});

describe("Gmail MIME send", () => {
  it("preserves UTF-8 Chinese and validates headers against injection", async () => {
    const raw = buildGmailRawMessage({
      from: "buyer@example.test",
      to: "second@example.test",
      subject: "RFQ — testni upit",
      body: "您好：\n1,000件，Zlin 2025。",
      rfcMessageId: createGmailMessageId(),
    });
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    const unicodeSubject = "Ponuda — 测试 / ".repeat(14);
    const longRaw = buildGmailRawMessage({
      from: "buyer@example.test",
      to: "second@example.test",
      subject: unicodeSubject,
      body: "Test",
      rfcMessageId: createGmailMessageId(),
    });
    const longMime = Buffer.from(longRaw, "base64url").toString("utf8");
    const headerLines = longMime.split("\\r\\n").filter(
      (line) => line.startsWith("Subject: ") || line.startsWith(" =?UTF-8?B?"),
    );
    expect(headerLines.length).toBeGreaterThan(1);
    expect(headerLines.every((line) => line.length <= 78)).toBe(true);
    const decoded = Array.from(
      longMime.matchAll(/=\\?UTF-8\\?B\\?([A-Za-z0-9+/=]+)\\?=/g),
      (match) => Buffer.from(match[1], "base64"),
    );
    expect(Buffer.concat(decoded).toString("utf8")).toBe(unicodeSubject);

    expect(mime).toContain("Subject: =?UTF-8?B?");
    const bodyEncoded = mime.split("\r\n\r\n")[1].replace(/\s/g, "");
    expect(Buffer.from(bodyEncoded, "base64").toString("utf8")).toContain("Zlin 2025");
    expect(() => buildGmailRawMessage({
      from: "buyer@example.test",
      to: "second@example.test\r\nBcc:evil@example.test",
      subject: "test",
      body: "Hello",
      rfcMessageId: createGmailMessageId(),
    })).toThrow();
    const delivered = await sendGmailMessage("sample-access", raw,
      (async (_url, init) => {
        expect(init?.method).toBe("POST");
        expect(String(init?.headers && (init.headers as Record<string,string>).authorization)).toBe("Bearer sample-access");
        expect(JSON.parse(String(init?.body)).raw).toBe(raw);
        return new Response(JSON.stringify({ id: "gmail-msg", threadId: "gmail-thread" }), { status: 200 });
      }) as typeof fetch);
    expect(delivered).toEqual({
      providerMessageId: "gmail-msg", providerThreadId: "gmail-thread",
    });
  });
});
