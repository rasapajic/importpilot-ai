import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_OAUTH_STATE_COOKIE = "importpilot_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "importpilot_google_oauth_verifier";
export const GOOGLE_OAUTH_FLOW_COOKIE = "importpilot_google_oauth_flow";
export const GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60;

export class GoogleOAuthConfigurationError extends Error {}
export class GoogleOAuthExchangeError extends Error {}
export class GoogleOAuthProfileError extends Error {}

export type GoogleOAuthFlow = "login" | "register";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleIdentity = {
  providerAccountId: string;
  email: string;
  name: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

function base64UrlSha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function getGoogleOAuthConfig(origin: string): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleOAuthConfigurationError("Google OAuth is not configured.");
  }

  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    `${origin.replace(/\/$/, "")}/api/auth/google/callback`;

  return { clientId, clientSecret, redirectUri };
}

export function createGoogleOAuthAttempt() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  return {
    state,
    verifier,
    challenge: base64UrlSha256(verifier),
  };
}

export function buildGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  attempt: ReturnType<typeof createGoogleOAuthAttempt>,
) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("code_challenge", attempt.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeGoogleCodeForIdentity(
  config: GoogleOAuthConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const tokenResponse = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  if (!tokenResponse) {
    throw new GoogleOAuthExchangeError("Google token exchange failed.");
  }

  const tokenPayload = await tokenResponse.json().catch(() => null) as GoogleTokenResponse | null;
  const accessToken = tokenPayload?.access_token?.trim();
  if (!tokenResponse.ok || !accessToken) {
    throw new GoogleOAuthExchangeError(
      tokenPayload?.error_description || tokenPayload?.error || "Google token exchange failed.",
    );
  }

  const profileResponse = await fetcher(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);

  if (!profileResponse) {
    throw new GoogleOAuthProfileError("Google profile request failed.");
  }

  const profile = await profileResponse.json().catch(() => null) as GoogleUserInfoResponse | null;
  if (
    !profileResponse.ok ||
    !profile?.sub?.trim() ||
    !profile.email?.trim() ||
    profile.email_verified !== true
  ) {
    throw new GoogleOAuthProfileError("Google did not return a verified email identity.");
  }

  const email = profile.email.trim().toLowerCase();
  const fallbackName = email.split("@")[0] || "ImportPilot User";
  const name = profile.name?.trim() || fallbackName;

  return {
    providerAccountId: profile.sub.trim(),
    email,
    name: name.slice(0, 120),
  };
}
