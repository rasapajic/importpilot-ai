import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { connectGmailMailbox } from "@/modules/negotiation/application/gmail-mailbox-connection-service";
import {
  clearGmailConnectCookies,
  gmailConnectCookieValue,
  validGmailConnectCallback,
} from "@/modules/negotiation/infrastructure/gmail-connect-cookies";
import {
  exchangeGmailConnectCode,
  gmailConnectionConfig,
} from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

function resultRedirect(request: NextRequest, reason: string) {
  const trustedOrigin = process.env.APP_ORIGIN ||
    (process.env.RENDER_SERVICE_ID === "srv-datu3v093c1s73c17m60"
      ? "https://jakov360-acceptance-staging.onrender.com"
      : request.nextUrl.origin);
  const url = new URL("/account", trustedOrigin);
  url.searchParams.set("gmail", reason);
  return clearGmailConnectCookies(NextResponse.redirect(url, { status: 303 }));
}

/**
 * One-time authorization callback. Never assumes a connected Google account
 * is the same account used for JAKOV360 sign-in.
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentSession();
  const error = request.nextUrl.searchParams.get("error");
  if (error) return resultRedirect(request, "cancelled");
  if (!auth || !["OWNER", "ADMIN"].includes(auth.membership.role)) {
    return resultRedirect(request, "unauthorized");
  }

  const valid = validGmailConnectCallback({
    cookieState: gmailConnectCookieValue(request, "state"),
    state: request.nextUrl.searchParams.get("state"),
    cookieVerifier: gmailConnectCookieValue(request, "verifier"),
    cookieUserId: gmailConnectCookieValue(request, "user"),
    cookieOrganizationId: gmailConnectCookieValue(request, "org"),
    authenticatedUserId: auth.user.id,
    authenticatedOrganizationId: auth.membership.organizationId,
  });
  if (!valid) return resultRedirect(request, "invalid-state");

  const verifier = gmailConnectCookieValue(request, "verifier");
  const code = request.nextUrl.searchParams.get("code");
  if (!verifier || !code) return resultRedirect(request, "invalid-state");

  try {
    const mailbox = await exchangeGmailConnectCode({
      code,
      verifier,
      config: gmailConnectionConfig(),
    });
    await connectGmailMailbox({
      organizationId: auth.membership.organizationId,
      connectedByUserId: auth.user.id,
      mailbox,
    });
    return resultRedirect(request, "connected");
  } catch {
    // No OAuth codes, tokens, identities or provider error descriptions in logs.
    return resultRedirect(request, "failed");
  }
}
