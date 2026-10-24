import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { SupplierMailProvider } from "@/modules/negotiation/domain/supplier-mail-link";

export const GMAIL_CONNECT_COOKIE = "jakov360_gmail_connect";
export const GMAIL_CONNECT_COOKIE_PATH = "/api/mail/gmail";
export const GMAIL_CONNECT_TTL_MS = 10 * 60 * 1000;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PROFILE_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GmailConnectAttempt = {
  provider: SupplierMailProvider;
  state: string;
  verifier: string;
  userId: string;
  organizationId: string;
  createdAt: number;
};

export function createGmailConnectAttempt(
  userId: string,
  organizationId: string,
  now = Date.now(),
): GmailConnectAttempt {
  return {
    provider: "GMAIL",
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    userId,
    organizationId,
    createdAt: now,
  };
}

export function safeGmailStateEqual(left: string | undefined, right: string | null): boolean {
  if (!left || !right || left.length > 256 || right.length > 256) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyGmailConnectAttempt(
  attempt: GmailConnectAttempt,
  state: string | null,
  session: { userId: string; organizationId: string },
  now = Date.now(),
): boolean {
  return Boolean(
    attempt.provider === "GMAIL" &&
    safeGmailStateEqual(attempt.state, state) &&
    attempt.userId === session.userId &&
    attempt.organizationId === session.organizationId &&
    attempt.createdAt <= now &&
    now - attempt.createdAt <= GMAIL_CONNECT_TTL_MS &&
    /^[a-zA-Z0-9_-]{40,150}$/.test(attempt.verifier),
  );
}

export function buildGmailConnectUrl(
  config: { clientId: string; redirectUri: string },
  attempt: GmailConnectAttempt,
): string {
  const challenge = createHash("sha256").update(attempt.verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `openid email profile ${GMAIL_SEND_SCOPE}`);
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  return url.toString();
}

export type GmailAuthorization = {
  accessToken: string;
  refreshToken: string;
  email: string;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  email?: unknown;
};

type ProfileResponse = {
  email?: unknown;
  email_verified?: unknown;
};

/** Exchanges ONLY a separate mailbox-connect grant, never the sign-in grant. */
export async function exchangeGmailConnectCode(
  code: string,
  verifier: string,
  config: { clientId: string; clientSecret: string; redirectUri: string },
  fetcher: typeof fetch = fetch,
): Promise<GmailAuthorization> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("GMAIL_CONNECT_TOKEN_EXCHANGE_FAILED");
  const token = await response.json().catch(() => null) as TokenResponse | null;
  if (
    typeof token?.access_token !== "string" ||
    typeof token?.refresh_token !== "string" ||
    typeof token?.scope !== "string" ||
    !token.scope.split(/\s+/).includes(GMAIL_SEND_SCOPE)
  ) {
    throw new Error("GMAIL_CONNECT_PERMISSION_MISSING");
  }
  const profileResponse = await fetcher(PROFILE_URL, {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!profileResponse.ok) throw new Error("GMAIL_CONNECT_PROFILE_UNVERIFIED");
  const profile = await profileResponse.json().catch(() => null) as ProfileResponse | null;
  if (
    profile?.email_verified !== true ||
    typeof profile.email !== "string" ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(profile.email) ||
    profile.email.length > 320
  ) {
    throw new Error("GMAIL_CONNECT_PROFILE_UNVERIFIED");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    email: profile.email.trim().toLowerCase(),
  };
}

export async function refreshGmailAccessToken(
  refreshToken: string,
  config: { clientId: string; clientSecret: string },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("GMAIL_TOKEN_REFRESH_FAILED");
  const token = await response.json().catch(() => null) as TokenResponse | null;
  if (typeof token?.access_token !== "string" || !token.access_token) {
    throw new Error("GMAIL_TOKEN_REFRESH_FAILED");
  }
  // Token refresh scopes normally remain unchanged. The original grant was
  // checked for gmail.send at connect time.
  return token.access_token;
}

export async function revokeGmailToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(8_000),
  });
  return response.ok;
}
