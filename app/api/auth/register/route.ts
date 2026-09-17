import { NextRequest, NextResponse } from "next/server";

import {
  EmailAlreadyExistsError,
  register,
} from "@/modules/auth/application/auth-service";
import { registerSchema } from "@/modules/auth/domain/validation";
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
  if (nativeForm) return nativeAuthRedirect(request, "/register", code);
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const nativeForm = isNativeAuthFormPost(request);

  try {
    if (!isSameOrigin(request)) {
      return errorResponse(request, nativeForm, "forbidden", "Zahtev nije dozvoljen.", 403);
    }

    const context = getRequestContext(request);
    const rateLimit = await consumeRateLimit({
      key: `register:${context.ipAddress ?? "unknown"}`,
      limit: 5,
      windowSeconds: 60 * 60,
    });

    if (!rateLimit.allowed) {
      return errorResponse(
        request,
        nativeForm,
        "rate-limited",
        "Previše pokušaja. Pokušajte ponovo kasnije.",
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const result = registerSchema.safeParse(await readAuthRequestBody(request, nativeForm));
    if (!result.success) {
      return errorResponse(
        request,
        nativeForm,
        "invalid",
        result.error.issues[0]?.message ?? "Neispravni podaci.",
        400,
      );
    }

    const token = await register(result.data, context);
    await setSessionCookie(token);

    if (process.env.NODE_ENV === "development") {
      console.info(JSON.stringify({
        service: "importpilot-web",
        event: "auth_register_completed",
        durationMs: Date.now() - startedAt,
      }));
    }

    if (nativeForm) return nativeAuthRedirect(request, "/dashboard");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return errorResponse(
        request,
        nativeForm,
        "exists",
        "Nalog sa ovom adresom već postoji.",
        409,
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.error(JSON.stringify({
        service: "importpilot-web",
        event: "auth_register_failed",
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
    return errorResponse(request, nativeForm, "unavailable", "AUTH_UNAVAILABLE", 500);
  }
}
