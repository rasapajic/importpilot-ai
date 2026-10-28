import { GMAIL_SEND_SCOPE } from "./gmail-send-foundation";

const STAGING_RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GMAIL_CONNECT_COOKIE_PATH = "/api/mail/google";
export const GMAIL_CONNECT_COOKIE_TTL_SECONDS = 600;
export const GMAIL_CONNECT_COOKIE_PREFIX = "jakov360_gmail_connect_";

export class GmailConnectNotConfiguredError extends Error {
  constructor() {
    super("Gmail connection is unavailable in this environment.");
    this.name = "GmailConnectNotConfiguredError";
  }
}
export class GmailConnectAuthorizationError extends Error {
  constructor() {
    super("Google did not approve a verified Gmail mailbox with send access.");
    this.name = "GmailConnectAuthorizationError";
  }
}

/** Authenticated, but not the designated acceptance organization or user. */
export class GmailAcceptanceDeniedError extends Error {
  constructor() {
    super("Gmail is limited to the designated acceptance organization and users.");
    this.name = "GmailAcceptanceDeniedError";
  }
}

/** Upper bound for the server-only designated user list. Longer lists deny. */
export const GMAIL_ACCEPTANCE_USER_LIMIT = 32;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function canonicalUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(trimmed) || trimmed === NIL_UUID) return null;
  return trimmed;
}

export function gmailConnectionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.JAKOV360_GMAIL_STAGING_ENABLED !== "true") return false;
  if (env.RENDER_SERVICE_ID === STAGING_RENDER_SERVICE_ID) return true;
  return !env.RENDER_SERVICE_ID && env.NODE_ENV === "development";
}

/**
 * Fail closed. Empty, malformed, nil, or oversized values deny every actor.
 * Local development still requires this list; it does not bypass staging checks.
 */
export function gmailAcceptanceAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): { organizationId: string; userIds: ReadonlySet<string> } | null {
  const organizationId = canonicalUuid(env.JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID);
  if (!organizationId) return null;
  const tokens = (env.JAKOV360_GMAIL_ACCEPTANCE_USER_IDS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length === 0 || tokens.length > GMAIL_ACCEPTANCE_USER_LIMIT) return null;
  const userIds = new Set<string>();
  for (const token of tokens) {
    const userId = canonicalUuid(token);
    if (!userId) return null;
    userIds.add(userId);
  }
  return { organizationId, userIds };
}

export function assertGmailAcceptanceEnrollment(
  actor: { organizationId: string; userId: string },
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!gmailConnectionEnabled(env)) throw new GmailConnectNotConfiguredError();
  const allowlist = gmailAcceptanceAllowlist(env);
  if (!allowlist) throw new GmailConnectNotConfiguredError();
  const organizationId = canonicalUuid(actor.organizationId);
  const userId = canonicalUuid(actor.userId);
  if (
    !organizationId ||
    !userId ||
    organizationId !== allowlist.organizationId ||
    !allowlist.userIds.has(userId)
  ) {
    throw new GmailAcceptanceDeniedError();
  }
}

export function gmailConnectionConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!gmailConnectionEnabled(env)) throw new GmailConnectNotConfiguredError();
  const clientId = env.JAKOV360_GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.JAKOV360_GMAIL_CLIENT_SECRET?.trim();
  const redirectUri = env.JAKOV360_GMAIL_REDIRECT_URI?.trim();
  const origin = env.APP_ORIGIN?.trim();
  if (!clientId || !clientSecret || !redirectUri || !origin) {
    throw new GmailConnectNotConfiguredError();
  }
  let uri: URL;
  let expectedOrigin: URL;
  try {
    uri = new URL(redirectUri);
    expectedOrigin = new URL(origin);
  } catch {
    throw new GmailConnectNotConfiguredError();
  }
  if (
    uri.origin !== expectedOrigin.origin ||
    uri.pathname !== "/api/mail/google/callback" ||
    uri.search || uri.hash ||
    (
      uri.protocol !== "https:" &&
      !(uri.protocol === "http:" && ["127.0.0.1", "localhost"].includes(uri.hostname))
    )
  ) {
    throw new GmailConnectNotConfiguredError();
  }
  if (
    env.RENDER_SERVICE_ID === STAGING_RENDER_SERVICE_ID &&
    expectedOrigin.origin !== "https://jakov360-acceptance-staging.onrender.com"
  ) {
    throw new GmailConnectNotConfiguredError();
  }
  return { clientId, clientSecret, redirectUri, origin: expectedOrigin.origin };
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

export type AuthorizedGmailMailbox = {
  providerAccountId: string;
  email: string;
  refreshToken: string;
  grantedScopes: string;
};

export async function exchangeGmailConnectCode(
  input: {
    config: ReturnType<typeof gmailConnectionConfig>;
    code: string;
    verifier: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<AuthorizedGmailMailbox> {
  if (!input.code || input.code.length > 4096 || !/^[A-Za-z0-9_-]{43,128}$/.test(input.verifier)) {
    throw new GmailConnectAuthorizationError();
  }
  let tokenResponse: Response;
  try {
    tokenResponse = await fetcher(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.verifier,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        redirect_uri: input.config.redirectUri,
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new GmailConnectAuthorizationError();
  }
  const tokens = await tokenResponse.json().catch(() => null) as GoogleTokenResponse | null;
  const scopes = new Set(tokens?.scope?.split(/\s+/).filter(Boolean) ?? []);
  if (
    !tokenResponse.ok ||
    tokens?.token_type?.toLowerCase() !== "bearer" ||
    !tokens?.access_token ||
    !tokens?.refresh_token ||
    !scopes.has(GMAIL_SEND_SCOPE) ||
    !scopes.has("openid") ||
    !scopes.has("email")
  ) {
    throw new GmailConnectAuthorizationError();
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetcher(GOOGLE_USERINFO_URL, {
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new GmailConnectAuthorizationError();
  }
  const profile = await profileResponse.json().catch(() => null) as GoogleUserInfo | null;
  const mailboxEmail = profile?.email?.trim().toLowerCase() ?? "";
  if (
    !profileResponse.ok ||
    !profile?.sub?.trim() ||
    profile.email_verified !== true ||
    mailboxEmail.length > 320 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mailboxEmail)
  ) {
    throw new GmailConnectAuthorizationError();
  }

  return {
    providerAccountId: profile.sub.trim(),
    email: mailboxEmail,
    refreshToken: tokens.refresh_token,
    grantedScopes: ["openid", "email", GMAIL_SEND_SCOPE].join(" "),
  };
}
