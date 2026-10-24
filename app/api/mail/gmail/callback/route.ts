import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { storeConnectedGmailMailbox } from "@/modules/negotiation/application/connected-supplier-mail-service";
import {
  GMAIL_ACCEPTANCE_ORIGIN,
  gmailAcceptanceEnabled,
  gmailOAuthConfig,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";
import {
  exchangeGmailConnectCode,
  GMAIL_CONNECT_COOKIE,
  GMAIL_CONNECT_COOKIE_PATH,
  verifyGmailConnectAttempt,
  type GmailConnectAttempt,
} from "@/modules/negotiation/infrastructure/gmail-oauth";
import { decryptMailboxJson } from "@/modules/negotiation/infrastructure/mailbox-token-vault";

function finish(status: string) {
  const response = NextResponse.redirect(
    new URL(`/account?gmail=${encodeURIComponent(status)}`, GMAIL_ACCEPTANCE_ORIGIN),
  );
  response.cookies.set(GMAIL_CONNECT_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: GMAIL_CONNECT_COOKIE_PATH,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await getCurrentSession();
  if (
    !auth ||
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return new NextResponse("Not found", { status: 404 });
  if (request.nextUrl.searchParams.has("error")) return finish("cancelled");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const sealed = request.cookies.get(GMAIL_CONNECT_COOKIE)?.value;
  if (!code || code.length > 4096 || !sealed || sealed.length > 4096) {
    return finish("invalid-state");
  }

  try {
    const attempt = decryptMailboxJson<GmailConnectAttempt>(
      sealed,
      "jakov360:gmail:connect:v1",
    );
    const valid = verifyGmailConnectAttempt(attempt, state, {
      userId: auth.user.id,
      organizationId: auth.membership.organizationId,
    });
    if (!valid) return finish("invalid-state");

    const grant = await exchangeGmailConnectCode(
      code,
      attempt.verifier,
      gmailOAuthConfig(),
    );
    await storeConnectedGmailMailbox({
      userId: auth.user.id,
      organizationId: auth.membership.organizationId,
    }, {
      email: grant.email,
      refreshToken: grant.refreshToken,
    });
    return finish("connected");
  } catch {
    // Never echo provider errors, OAuth codes, tokens or untrusted identity.
    return finish("failed");
  }
}
