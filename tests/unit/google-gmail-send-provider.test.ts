import { describe, expect, it } from "vitest";

import {
  GmailProviderUncertainError,
  googleGmailSendProvider,
} from "../../modules/negotiation/infrastructure/google-gmail-send-provider";

const args = {
  refreshToken: "fake-refresh-token",
  raw: "synthetic-base64url",
  clientId: "test-client",
  clientSecret: "fake-client-secret",
};

describe("Gmail send transport", () => {
  it("refreshes the access token, then sends exactly one Gmail message", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          access_token: "fake-access-token",
          token_type: "Bearer",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "sent-message-12", threadId: "thread-45" }), { status: 200 });
    }) as typeof fetch;
    const receipt = await googleGmailSendProvider(fetcher).send(args);
    expect(receipt).toEqual({
      providerMessageId: "sent-message-12",
      providerThreadId: "thread-45",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[1].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect((calls[0].init?.body as URLSearchParams).get("refresh_token")).toBe(args.refreshToken);
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ raw: args.raw });
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer fake-access-token");
  });

  it("does not send if refresh token exchange fails", async () => {
    let calls = 0;
    const transport = googleGmailSendProvider((async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }) as typeof fetch);
    await expect(transport.send(args)).rejects.toBeInstanceOf(GmailProviderUncertainError);
    expect(calls).toBe(1);
  });

  it("does not retry ambiguous Gmail server failures", async () => {
    let calls = 0;
    const transport = googleGmailSendProvider((async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({
          access_token: "fake-access",
          token_type: "Bearer",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
    }) as typeof fetch);
    await expect(transport.send(args)).rejects.toBeInstanceOf(GmailProviderUncertainError);
    expect(calls).toBe(2);
  });

  it("refuses to claim success without both message and thread IDs", async () => {
    let calls = 0;
    const transport = googleGmailSendProvider((async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1
        ? { access_token: "fake-access", token_type: "Bearer" }
        : { id: "sent-message" }), { status: 200 });
    }) as typeof fetch);
    await expect(transport.send(args)).rejects.toBeInstanceOf(GmailProviderUncertainError);
    expect(calls).toBe(2);
  });
});
