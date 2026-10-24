import { NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import {
  GMAIL_ACCEPTANCE_ORIGIN,
  gmailAcceptanceEnabled,
  gmailOAuthConfig,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";
import {
  buildGmailConnectUrl,
  createGmailConnectAttempt,
  GMAIL_CONNECT_COOKIE,
  GMAIL_CONNECT_COOKIE_PATH,
  GMAIL_CONNECT_TTL_MS,
} from "@/modules/negotiation/infrastructure/gmail-oauth";
import { encryptMailboxJson } from "@/modules/negotiation/infrastructure/mailbox-token-vault";

export async function GET() {
  const auth = await getCurrentSession();
  if (
    !auth ||
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return new NextResponse("Not found", { status: 404 });
  try {
    const config = gmailOAuthConfig();
    const attempt = createGmailConnectAttempt(
      auth.user.id,
      auth.membership.organizationId,
    );
    const sealed = encryptMailboxJson(attempt, "jakov360:gmail:connect:v1");
    const url = buildGmailConnectUrl(config, attempt);
    const response = NextResponse.redirect(url);
    response.cookies.set(GMAIL_CONNECT_COOKIE, sealed, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: GMAIL_CONNECT_TTL_MS / 1000,
      path: GMAIL_CONNECT_COOKIE_PATH,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/account?gmail=not-configured", GMAIL_ACCEPTANCE_ORIGIN),
    );
  }
}
