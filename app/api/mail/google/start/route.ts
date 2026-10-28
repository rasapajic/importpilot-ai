import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { isSameOrigin } from "@/modules/auth/infrastructure/request-context";
import { assessGmailConnectStart } from "@/modules/negotiation/infrastructure/gmail-acceptance-gate";
import { gmailConnectAuthorizationUrl, newGmailConnectAttempt } from "@/modules/negotiation/infrastructure/gmail-send-foundation";
import { gmailConnectionConfig } from "@/modules/negotiation/infrastructure/gmail-connect-oauth";
import { bindGmailConnectCookies } from "@/modules/negotiation/infrastructure/gmail-connect-cookies";

/** Explicit POST from Account settings. Never reuses the sign-in OAuth flow. */
export async function POST(request: NextRequest) {
  const auth = await getCurrentSession();
  const admission = assessGmailConnectStart({
    userId: auth?.user.id ?? null,
    organizationId: auth?.membership.organizationId ?? null,
    role: auth?.membership.role ?? null,
    sameOrigin: isSameOrigin(request),
  });
  if (!admission.ok) {
    return NextResponse.json({ error: admission.error }, { status: admission.status });
  }
  if (!auth) {
    return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  }

  try {
    const config = gmailConnectionConfig();
    const attempt = newGmailConnectAttempt();
    const authorizationUrl = gmailConnectAuthorizationUrl(config, attempt);
    const response = NextResponse.redirect(authorizationUrl, { status: 303 });
    return bindGmailConnectCookies(
      response,
      attempt.state,
      attempt.verifier,
      auth.user.id,
      auth.membership.organizationId,
    );
  } catch {
    return NextResponse.json({
      error: "Gmail povezivanje još nije podešeno na ovom testnom okruženju.",
    }, { status: 503 });
  }
}
