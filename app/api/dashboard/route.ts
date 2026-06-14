import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/modules/auth/domain/constants";
import { validateSessionToken } from "@/modules/auth/infrastructure/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const auth = token ? await validateSessionToken(token) : null;
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  return NextResponse.json({
    user: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
    organization: {
      id: auth.membership.organization.id,
      name: auth.membership.organization.name,
      role: auth.membership.role,
    },
  });
}
