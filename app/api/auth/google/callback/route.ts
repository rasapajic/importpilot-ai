import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { loginWithGoogle } from "@/modules/auth/application/auth-service";
import {
  exchangeGoogleCodeForIdentity,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_FLOW_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  type GoogleOAuthFlow,
} from "@/modules/auth/infrastructure/google-oauth";
import { getRequestContext } from "@/modules/auth/infrastructure/request-context";
import { setSessionCookie } from "@/modules/auth/infrastructure/session";

function flowFromCookie(request: NextRequest): GoogleOAuthFlow {
  return request.cookies.get(GOOGLE_OAUTH_FLOW_COOKIE)?.value === "register"
    ? "register"
    : "login";
}

function safeEqual(left: string | undefined, right: string | null) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authPageUrl(request: NextRequest, flow: GoogleOAuthFlow, reason: string) {
  const url = new URL(flow === "register" ? "/register" : "/login", request.nextUrl.origin);
  url.searchParams.set("googleError", reason);
  return url;
}

function clearAttemptCookies(response: NextResponse) {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_VERIFIER_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_FLOW_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const flow = flowFromCookie(request);
  const providerError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;

  if (providerError) {
    return clearAttemptCookies(
      NextResponse.redirect(authPageUrl(request, flow, "cancelled")),
    );
  }

  if (!code || !verifier || !safeEqual(expectedState, returnedState)) {
    return clearAttemptCookies(
      NextResponse.redirect(authPageUrl(request, flow, "invalid-state")),
    );
  }

  try {
    const config = getGoogleOAuthConfig(request.nextUrl.origin);
    const identity = await exchangeGoogleCodeForIdentity(config, code, verifier);
    const token = await loginWithGoogle(identity, getRequestContext(request));
    await setSessionCookie(token);

    if (process.env.NODE_ENV === "development") {
      console.info(JSON.stringify({
        service: "importpilot-web",
        event: "auth_google_completed",
        durationMs: Date.now() - startedAt,
      }));
    }

    return clearAttemptCookies(
      NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin)),
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(JSON.stringify({
        service: "importpilot-web",
        event: "auth_google_failed",
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
    return clearAttemptCookies(
      NextResponse.redirect(authPageUrl(request, flow, "failed")),
    );
  }
}
