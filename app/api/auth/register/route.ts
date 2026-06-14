import { NextRequest, NextResponse } from "next/server";

import {
  EmailAlreadyExistsError,
  register,
} from "@/modules/auth/application/auth-service";
import { registerSchema } from "@/modules/auth/domain/validation";
import {
  getRequestContext,
  isSameOrigin,
} from "@/modules/auth/infrastructure/request-context";
import { consumeRateLimit } from "@/modules/auth/infrastructure/rate-limit";
import { setSessionCookie } from "@/modules/auth/infrastructure/session";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Zahtev nije dozvoljen." }, { status: 403 });
  }

  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    key: `register:${context.ipAddress ?? "unknown"}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Previše pokušaja. Pokušajte ponovo kasnije." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const result = registerSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }

  try {
    const token = await register(result.data, context);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Nalog sa ovom adresom već postoji." }, { status: 409 });
    }
    throw error;
  }
}
