import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  GMAIL_CONNECT_COOKIE_PATH,
  GMAIL_CONNECT_COOKIE_PREFIX,
  GMAIL_CONNECT_COOKIE_TTL_SECONDS,
} from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

export function gmailConnectCookieOptions(maxAge = GMAIL_CONNECT_COOKIE_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: GMAIL_CONNECT_COOKIE_PATH,
    maxAge,
  };
}

export function bindGmailConnectCookies(
  response: NextResponse,
  state: string,
  verifier: string,
  userId: string,
  organizationId: string,
) {
  const options = gmailConnectCookieOptions();
  for (const [suffix, value] of Object.entries({ state, verifier, user: userId, org: organizationId })) {
    response.cookies.set(GMAIL_CONNECT_COOKIE_PREFIX + suffix, value, options);
  }
  return response;
}

export function clearGmailConnectCookies(response: NextResponse) {
  const options = gmailConnectCookieOptions(0);
  for (const suffix of ["state", "verifier", "user", "org"]) {
    response.cookies.set(GMAIL_CONNECT_COOKIE_PREFIX + suffix, "", options);
  }
  return response;
}

function constantTimeEquals(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length > 4096 || b.length > 4096) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** OAuth callback must belong to the same authenticated user + organization. */
export function validGmailConnectCallback(
  input: {
    cookieState?: string;
    state?: string | null;
    cookieVerifier?: string;
    cookieUserId?: string;
    cookieOrganizationId?: string;
    authenticatedUserId: string;
    authenticatedOrganizationId: string;
  },
): boolean {
  return (
    constantTimeEquals(input.cookieState, input.state ?? null) &&
    Boolean(input.cookieVerifier && /^[A-Za-z0-9_-]{43,128}$/.test(input.cookieVerifier)) &&
    Boolean(input.cookieUserId && input.cookieUserId === input.authenticatedUserId) &&
    Boolean(input.cookieOrganizationId && input.cookieOrganizationId === input.authenticatedOrganizationId)
  );
}

export function gmailConnectCookieValue(request: NextRequest, field: string) {
  return request.cookies.get(GMAIL_CONNECT_COOKIE_PREFIX + field)?.value;
}
