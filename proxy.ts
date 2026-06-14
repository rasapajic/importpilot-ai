import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/modules/auth/domain/constants";
import { rotateSessionToken } from "@/modules/auth/infrastructure/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const response = NextResponse.next();
    const rotation = await rotateSessionToken(token);
    if (rotation) {
      response.cookies.set(SESSION_COOKIE, rotation.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: rotation.expiresAt,
      });
    }
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/((?!auth|health).*)"],
};
