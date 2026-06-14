import { NextRequest, NextResponse } from "next/server";

import { logout } from "@/modules/auth/application/auth-service";
import {
  getRequestContext,
  isSameOrigin,
} from "@/modules/auth/infrastructure/request-context";
import {
  clearSessionCookie,
  SESSION_COOKIE,
} from "@/modules/auth/infrastructure/session";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Zahtev nije dozvoljen." }, { status: 403 });
  }

  await logout(request.cookies.get(SESSION_COOKIE)?.value, getRequestContext(request));
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
