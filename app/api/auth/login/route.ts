import { NextRequest, NextResponse } from "next/server";

import {
  InvalidCredentialsError,
  login,
} from "@/modules/auth/application/auth-service";
import { loginSchema } from "@/modules/auth/domain/validation";
import {
  getRequestContext,
  isSameOrigin,
} from "@/modules/auth/infrastructure/request-context";
import { consumeRateLimit } from "@/modules/auth/infrastructure/rate-limit";
import { setSessionCookie } from "@/modules/auth/infrastructure/session";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "Zahtev nije dozvoljen." }, { status: 403 });
    }

    const result = loginSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: "Email ili lozinka nisu ispravni." }, { status: 400 });
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
      return NextResponse.json(
        { error: "Previše pokušaja. Pokušajte ponovo kasnije." },
        { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: "Email ili lozinka nisu ispravni." }, { status: 401 });
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
    return NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 500 });
  }
}
