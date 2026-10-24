/** Acceptance-only Gmail feature gate; fails closed outside the exact service and tenant. */
export const GMAIL_ACCEPTANCE_ORIGIN = "https://jakov360-acceptance-staging.onrender.com";
export const GMAIL_ACCEPTANCE_SERVICE_ID = "srv-datu3v093c1s73c17m60";

type MailEnvironment = Record<string, string | undefined>;

export function gmailAcceptanceEnabled(
  organizationId: string,
  env: MailEnvironment = process.env,
): boolean {
  return Boolean(
    organizationId &&
    env.RENDER_SERVICE_ID === GMAIL_ACCEPTANCE_SERVICE_ID &&
    env.JAKOV360_GMAIL_TEST_ENABLED === "1" &&
    env.JAKOV360_GMAIL_TEST_ORG_ID === organizationId,
  );
}

export function gmailAcceptanceRecipientAllowed(
  recipient: string,
  env: MailEnvironment = process.env,
): boolean {
  const allowed = env.JAKOV360_GMAIL_TEST_RECIPIENT?.trim().toLowerCase();
  const actual = recipient.trim().toLowerCase();
  return Boolean(
    allowed &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(allowed) &&
    actual === allowed,
  );
}

export function gmailOAuthConfig(env: MailEnvironment = process.env) {
  const clientId = env.GOOGLE_MAIL_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_MAIL_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_MAIL_OAUTH_REDIRECT_URI?.trim() ||
    `${GMAIL_ACCEPTANCE_ORIGIN}/api/mail/gmail/callback`;
  if (!clientId || !clientSecret || redirectUri !==
    `${GMAIL_ACCEPTANCE_ORIGIN}/api/mail/gmail/callback`) {
    throw new Error("GMAIL_MAILBOX_OAUTH_NOT_CONFIGURED");
  }
  return { clientId, clientSecret, redirectUri };
}

/** CSRF defense for authenticated state-changing requests; URL is not user-input. */
export function isTrustedGmailActionOrigin(origin: string | null): boolean {
  return origin === GMAIL_ACCEPTANCE_ORIGIN;
}
