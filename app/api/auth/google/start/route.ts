import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthAttempt,
  getGoogleOAuthConfig,
  GoogleOAuthConfigurationError,
  GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS,
  GOOGLE_OAUTH_FLOW_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  type GoogleOAuthFlow,
} from "@/modules/auth/infrastructure/google-oauth";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS,
  };
}

function flowFromRequest(request: NextRequest): GoogleOAuthFlow {
  return request.nextUrl.searchParams.get("from") === "register" ? "register" : "login";
}

function authPageUrl(request: NextRequest, flow: GoogleOAuthFlow, reason: string) {
  const url = new URL(flow === "register" ? "/register" : "/login", request.nextUrl.origin);
  url.searchParams.set("googleError", reason);
  return url;
}

export async function GET(request: NextRequest) {
  const flow = flowFromRequest(request);

  try {
    const config = getGoogleOAuthConfig(request.nextUrl.origin);
    const attempt = createGoogleOAuthAttempt();
    const response = NextResponse.redirect(buildGoogleAuthorizationUrl(config, attempt));
    const options = oauthCookieOptions();

    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, attempt.state, options);
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, attempt.verifier, options);
    response.cookies.set(GOOGLE_OAUTH_FLOW_COOKIE, flow, options);
    return response;
  } catch (error) {
    const reason = error instanceof GoogleOAuthConfigurationError
      ? "not-configured"
      : "start-failed";
    return NextResponse.redirect(authPageUrl(request, flow, reason));
  }
}
