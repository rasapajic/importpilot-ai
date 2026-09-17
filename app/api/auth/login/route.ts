import { NextRequest, NextResponse } from "next/server";

import {
  InvalidCredentialsError,
  login,
} from "@/modules/auth/application/auth-service";
import { loginSchema } from "@/modules/auth/domain/validation";
import {
  isNativeAuthFormPost,
  nativeAuthRedirect,
  readAuthRequestBody,
} from "@/modules/auth/infrastructure/native-auth";
import {
  getRequestContext,
  isSameOrigin,
} from "@/modules/auth/infrastructure/request-context";
import { consumeRateLimit } from "@/modules/auth/infrastructure/rate-limit";
import { setSessionCookie } from "@/modules/auth/infrastructure/session";

function errorResponse(
  request: NextRequest,
  nativeForm: boolean,
  code: string,
  error: string,
  status: number,
  headers?: HeadersInit,
) {
  if (nativeForm) return nativeAuthRedirect(request, "/login", code);
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const nativeForm = isNativeAuthFormPost(request);

  try {
    if (!isSameOrigin(request)) {
      return errorResponse(request, nativeForm, "forbidden", "Zahtev nije dozvoljen.", 403);
    }

    const result = loginSchema.safeParse(await readAuthRequestBody(request, nativeForm));
    if (!result.success) {
      return errorResponse(
        request,
        nativeForm,
        "invalid",
        "Email ili lozinka nisu ispravni.",
        400,
      );
    }

    const context = getRequestContext(request);
    const limits = await Promise.all([
      consumeRateLimit({
        key: `login-ip:${context.ipAddress ?? "unknown"}`,
        limit: 30,
        windowSeconds: 15 * 60,
      }),
      consumeRateLimit({
        key: `login-email:${result.data.email}`,
        limit: 10,
        windowSeconds: 15 * 60,
      }),
    ]);
    const blocked = limits.find((limit) => !limit.allowed);

    if (blocked) {
      return errorResponse(
        request,
        nativeForm,
        "rate-limited",
        "Previše pokušaja. Pokušajte ponovo kasnije.",
        429,
        { "Retry-After": String(blocked.retryAfterSeconds) },
      );
    }

    const token = await login(result.data, context);
    await setSessionCookie(token);

    if (process.env.NODE_ENV === "development") {
      console.info(JSON.stringify({
        service: "importpilot-web",
        event: "auth_login_completed",
        durationMs: Date.now() - startedAt,
      }));
    }

    if (nativeForm) return nativeAuthRedirect(request, "/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return errorResponse(
        request,
        nativeForm,
        "invalid",
        "Email ili lozinka nisu ispravni.",
        401,
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.error(JSON.stringify({
        service: "importpilot-web",
        event: "auth_login_failed",
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
    return errorResponse(request, nativeForm, "unavailable", "AUTH_UNAVAILABLE", 500);
  }
}
