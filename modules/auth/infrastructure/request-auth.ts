import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/modules/auth/domain/constants";
import { validateSessionToken } from "@/modules/auth/infrastructure/session";

export function authenticateRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? validateSessionToken(token) : null;
}

