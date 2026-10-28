export const INBOUND_MAIL_FLAG = "JAKOV360_INBOUND_MAIL_ENABLED";

/**
 * Receiving supplier mail is off unless the variable is exactly "true".
 * Missing credentials, "1", "yes", and "TRUE" stay off.
 */
export function isInboundMailEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[INBOUND_MAIL_FLAG] === "true";
}
