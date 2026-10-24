import { createHash, randomBytes } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type GmailConnectConfig = {
  clientId: string;
  redirectUri: string;
};

export type GmailConnectAttempt = {
  state: string;
  verifier: string;
  challenge: string;
};

/**
 * Explicit, independent mailbox permission. Not the JAKOV360 login flow.
 * Never add Gmail scopes to the existing login authorization request.
 */
export function newGmailConnectAttempt(): GmailConnectAttempt {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  return {
    state,
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function gmailConnectAuthorizationUrl(
  config: GmailConnectConfig,
  attempt: GmailConnectAttempt,
): URL {
  const redirect = new URL(config.redirectUri);
  if (
    redirect.protocol !== "https:" &&
    !(redirect.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirect.hostname))
  ) {
    throw new Error("Gmail OAuth redirect must be HTTPS (except loopback testing).");
  }
  if (!config.clientId.trim() || !attempt.state || !attempt.challenge) {
    throw new Error("Gmail OAuth config/attempt is incomplete.");
  }

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirect.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SEND_SCOPE);
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("code_challenge", attempt.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "false");
  return url;
}

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function headerText(text: string): string {
  if (/[\r\n\0]/.test(text)) throw new Error("Newline characters are forbidden in email headers.");
  return text.trim();
}

function emailAddress(input: string): string {
  const address = headerText(input);
  if (
    address.length > 320 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)
  ) {
    throw new Error("Invalid email address.");
  }
  return address;
}

function rfc2047(value: string): string {
  const text = headerText(value);
  return /[^\x20-\x7e]/.test(text)
    ? `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`
    : text;
}

/**
 * RFC 5322/MIME text-only message for Gmail users.messages.send.
 * The API accepts a base64url encoded raw MIME message.
 * Provider IDs are not known until Gmail confirms the send.
 */
export function encodeGmailTextMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  rfcMessageId: string;
}): string {
  const from = emailAddress(input.from);
  const to = emailAddress(input.to);
  const subject = rfc2047(input.subject);
  const messageId = headerText(input.rfcMessageId);
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(messageId)) {
    throw new Error("Invalid RFC Message-ID.");
  }
  if (!input.body.trim() || input.body.length > 100_000) {
    throw new Error("Message body is empty or too long.");
  }
  const body = input.body.replace(/\r?\n/g, "\r\n");
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n").replace(/\r\n$/, ""),
  ].join("\r\n");
  return base64url(mime);
}
