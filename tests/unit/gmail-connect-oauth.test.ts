import { describe, expect, it } from "vitest";
import {
  exchangeGmailConnectCode,
  GmailConnectAuthorizationError,
  GmailConnectNotConfiguredError,
  gmailConnectionConfig,
  gmailConnectionEnabled,
} from "../../modules/negotiation/infrastructure/gmail-connect-oauth";
import { GMAIL_SEND_SCOPE } from "../../modules/negotiation/infrastructure/gmail-send-foundation";

const staging = {
  RENDER_SERVICE_ID: "srv-datu3v093c1s73c17m60",
  JAKOV360_GMAIL_STAGING_ENABLED: "true",
  JAKOV360_GMAIL_CLIENT_ID: "client-id",
  JAKOV360_GMAIL_CLIENT_SECRET: "synthetic-secret",
  JAKOV360_GMAIL_REDIRECT_URI: "https://jakov360-acceptance-staging.onrender.com/api/mail/google/callback",
  APP_ORIGIN: "https://jakov360-acceptance-staging.onrender.com",
} as unknown as NodeJS.ProcessEnv;

describe("Gmail connection gated configuration", () => {
  it("only enables the explicit staging service (or local development)", () => {
    expect(gmailConnectionEnabled(staging)).toBe(true);
    expect(gmailConnectionEnabled({ ...staging, RENDER_SERVICE_ID: "srv-production" })).toBe(false);
    expect(gmailConnectionEnabled({ ...staging, JAKOV360_GMAIL_STAGING_ENABLED: "false" })).toBe(false);
    expect(gmailConnectionEnabled({ ...staging, RENDER_SERVICE_ID: undefined, NODE_ENV: "production" })).toBe(false);
    expect(gmailConnectionConfig(staging).redirectUri).toBe(staging.JAKOV360_GMAIL_REDIRECT_URI);
  });

  it("rejects mismatched and untrusted callback origins", () => {
    expect(() => gmailConnectionConfig({ ...staging, APP_ORIGIN: "https://evil.example" }))
      .toThrow(GmailConnectNotConfiguredError);
    expect(() => gmailConnectionConfig({ ...staging, JAKOV360_GMAIL_REDIRECT_URI: "https://evil.example/api/mail/google/callback" }))
      .toThrow(GmailConnectNotConfiguredError);
    expect(() => gmailConnectionConfig({ ...staging, JAKOV360_GMAIL_CLIENT_SECRET: "" }))
      .toThrow(GmailConnectNotConfiguredError);
  });
});

describe("Gmail connect code exchange", () => {
  const config = gmailConnectionConfig(staging);
  const input = {
    config,
    code: "synthetic-authorization-code",
    verifier: "x".repeat(64),
  };

  it("accepts only a Gmail send token plus a verified Google account", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({
          token_type: "Bearer",
          access_token: "synthetic-access-token",
          refresh_token: "synthetic-refresh-token",
          scope: `openid email ${GMAIL_SEND_SCOPE}`,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        sub: "google-sub-123",
        email: "User@Example.com",
        email_verified: true,
      }), { status: 200 });
    }) as typeof fetch;
    const result = await exchangeGmailConnectCode(input, fakeFetch);
    expect(result).toEqual({
      providerAccountId: "google-sub-123",
      email: "user@example.com",
      refreshToken: "synthetic-refresh-token",
      grantedScopes: `openid email ${GMAIL_SEND_SCOPE}`,
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(requests[0].init?.method).toBe("POST");
    expect((requests[0].init?.body as URLSearchParams).get("code_verifier")).toBe("x".repeat(64));
    expect(requests[1].url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect((requests[1].init?.headers as Record<string, string>).authorization).toBe("Bearer synthetic-access-token");
  });

  for (const [token, label] of [
    [{ token_type: "Bearer", access_token: "access", scope: `openid email ${GMAIL_SEND_SCOPE}` }, "missing refresh"],
    [{ token_type: "Bearer", access_token: "access", refresh_token: "refresh", scope: "openid email" }, "no send permission"],
    [{ token_type: "Bearer", access_token: "access", refresh_token: "refresh", scope: GMAIL_SEND_SCOPE }, "no email identity scope"],
    [{ token_type: "Bearer", access_token: "", refresh_token: "refresh", scope: `openid email ${GMAIL_SEND_SCOPE}` }, "missing access"],
  ] as const) {
    it(`rejects invalid provider tokens: ${label}`, async () => {
      const fakeFetch = (async () => new Response(JSON.stringify(token), { status: 200 })) as typeof fetch;
      await expect(exchangeGmailConnectCode(input, fakeFetch)).rejects.toBeInstanceOf(
        GmailConnectAuthorizationError,
      );
    });
  }

  it("rejects unverified email and avoids persisting its provider token", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? {
        token_type: "Bearer",
        access_token: "access",
        refresh_token: "refresh",
        scope: `openid email ${GMAIL_SEND_SCOPE}`,
      } : {
        sub: "google-sub-123",
        email: "unverified@example.com",
        email_verified: false,
      }), { status: 200 });
    }) as typeof fetch;
    await expect(exchangeGmailConnectCode(input, fakeFetch)).rejects.toBeInstanceOf(
      GmailConnectAuthorizationError,
    );
  });
});
