import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { isSameOrigin } from "@/modules/auth/infrastructure/request-context";
import {
  disconnectGmailMailbox,
  revokeGoogleGmailToken,
} from "@/modules/negotiation/application/gmail-mailbox-connection-service";

export async function POST(request: NextRequest) {
  const auth = await getCurrentSession();
  if (!auth) return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(auth.membership.role) || !isSameOrigin(request)) {
    return NextResponse.json({ error: "Nemate dozvolu." }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const connectionId = form?.get("connectionId");
  if (
    typeof connectionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(connectionId)
  ) {
    return NextResponse.json({ error: "Neispravna Gmail veza." }, { status: 400 });
  }
  try {
    const disconnected = await disconnectGmailMailbox({
      organizationId: auth.membership.organizationId,
      connectionId,
      revoke: revokeGoogleGmailToken,
    });
    const origin = process.env.APP_ORIGIN || request.nextUrl.origin;
    const target = new URL("/account", origin);
    target.searchParams.set("gmail", disconnected ? "disconnected" : "not-found");
    return NextResponse.redirect(target, { status: 303 });
  } catch {
    return NextResponse.json({ error: "Prekid veze nije uspeo." }, { status: 500 });
  }
}
