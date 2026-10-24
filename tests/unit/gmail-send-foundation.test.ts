import { describe, expect, it } from "vitest";
import {
  encodeGmailTextMessage,
  gmailConnectAuthorizationUrl,
  GMAIL_SEND_SCOPE,
  newGmailConnectAttempt,
} from "../../modules/negotiation/infrastructure/gmail-send-foundation";

describe("Gmail M1 isolated user consent", () => {
  it("requests gmail.send alone, using PKCE and offline consent", () => {
    const attempt = newGmailConnectAttempt();
    expect(attempt.verifier).toHaveLength(64);
    expect(attempt.state.length).toBeGreaterThan(30);
    const url = gmailConnectAuthorizationUrl({
      clientId: "test-client-id",
      redirectUri: "https://staging.example.test/api/mail/google/callback",
    }, attempt);
    expect(url.searchParams.get("scope")).toBe(GMAIL_SEND_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(attempt.challenge);
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.toString()).not.toContain("gmail.readonly");
    expect(url.toString()).not.toContain("mail.google.com");
  });

  it("rejects insecure non-loopback callback", () => {
    expect(() => gmailConnectAuthorizationUrl({
      clientId: "client",
      redirectUri: "http://example.com/callback",
    }, newGmailConnectAttempt())).toThrow(/HTTPS/);
  });
});

describe("Gmail M1 RFC message encoding", () => {
  const valid = {
    from: "buyer@example.com",
    to: "supplier@example.cn",
    subject: "TEST — Zlin 2025",
    body: "Hello supplier!\n测试邮件",
    rfcMessageId: "<demo-123@jakov360.test>",
  };

  it("builds UTF-8 MIME message with unchanged body", () => {
    const encoded = encodeGmailTextMessage(valid);
    const mime = Buffer.from(encoded, "base64url").toString("utf8");
    expect(mime).toContain("From: buyer@example.com\r\nTo: supplier@example.cn");
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime).toContain("Message-ID: <demo-123@jakov360.test>");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hello supplier!\r\n测试邮件");
  });

  it("blocks CRLF header injection and invalid recipients", () => {
    expect(() => encodeGmailTextMessage({ ...valid, subject: "Hi\r\nBcc: evil@example.com" })).toThrow();
    expect(() => encodeGmailTextMessage({ ...valid, to: "invalid" })).toThrow();
    expect(() => encodeGmailTextMessage({ ...valid, from: "a@example.com\r\nReply-To: evil@example.com" })).toThrow();
    expect(() => encodeGmailTextMessage({ ...valid, rfcMessageId: "not-message-id" })).toThrow();
  });

  it("refuses empty messages", () => {
    expect(() => encodeGmailTextMessage({ ...valid, body: " " })).toThrow();
  });
});
