import { randomUUID } from "node:crypto";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailOutboundDraft = {
  from: string;
  to: string;
  subject: string;
  body: string;
  rfcMessageId: string;
};

function safeHeader(value: string, limit: number): string {
  if (
    !value.trim() ||
    value.length > limit ||
    /[\r\n\x00-\x1f\x7f]/.test(value)
  ) throw new Error("GMAIL_UNSAFE_MESSAGE_HEADER");
  return value.trim();
}

function validEmail(value: string) {
  const email = safeHeader(value, 320);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
    throw new Error("GMAIL_INVALID_EMAIL_ADDRESS");
  }
  return email;
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]+$/.test(value)) return value;
  // RFC 2047: each encoded-word must remain short enough for a 78-char
  // folded header line. Split only between complete UTF-8 code points.
  const words: string[] = [];
  let chunk: Buffer[] = [];
  let length = 0;
  function flush() {
    if (length === 0) return;
    words.push(`=?UTF-8?B?${Buffer.concat(chunk).toString("base64")}?=`);
    chunk = [];
    length = 0;
  }
  for (const point of value) {
    const bytes = Buffer.from(point, "utf8");
    if (length + bytes.length > 42) flush();
    chunk.push(bytes);
    length += bytes.length;
  }
  flush();
  return words.join("\r\n ");
}

export function createGmailMessageId() {
  return `<${randomUUID()}@jakov360.com>`;
}

/** Build UTF-8 RFC 5322 text/plain MIME as base64url-encoded Gmail raw. */
export function buildGmailRawMessage(draft: GmailOutboundDraft): string {
  const from = validEmail(draft.from);
  const to = validEmail(draft.to);
  const subject = safeHeader(draft.subject, 400);
  const rfcMessageId = safeHeader(draft.rfcMessageId, 255);
  if (!/^<[^<>\s]+@[^<>\s]+>$/.test(rfcMessageId)) {
    throw new Error("GMAIL_INVALID_MESSAGE_ID");
  }
  if (!draft.body.trim() || draft.body.length > 50_000) {
    throw new Error("GMAIL_INVALID_MESSAGE_BODY");
  }
  const encodedBody = Buffer.from(draft.body, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)?.join("\r\n") ?? "";
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${rfcMessageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export async function sendGmailMessage(
  accessToken: string,
  raw: string,
  fetcher: typeof fetch = fetch,
): Promise<{ providerMessageId: string; providerThreadId: string }> {
  if (!accessToken || !raw) throw new Error("GMAIL_SEND_INVALID_INPUT");
  const response = await fetcher(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("GMAIL_SEND_PROVIDER_FAILED");
  const result = await response.json().catch(() => null) as {
    id?: unknown; threadId?: unknown;
  } | null;
  if (
    typeof result?.id !== "string" ||
    typeof result.threadId !== "string" ||
    !result.id ||
    !result.threadId
  ) {
    throw new Error("GMAIL_SEND_PROVIDER_RESPONSE_INCOMPLETE");
  }
  return { providerMessageId: result.id, providerThreadId: result.threadId };
}
