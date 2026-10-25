import { NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { listGmailMailboxConnections } from "@/modules/negotiation/application/gmail-mailbox-connection-service";
import { gmailConnectionConfig } from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

export async function GET() {
  const auth = await getCurrentSession();
  if (!auth) return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(auth.membership.role)) {
    return NextResponse.json({ error: "Nemate dozvolu." }, { status: 403 });
  }
  try {
    gmailConnectionConfig();
    const connections = (await listGmailMailboxConnections(auth.membership.organizationId))
      .filter((mailbox) => mailbox.connectedByUserId === auth.user.id);
    return NextResponse.json({ connections }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Feature is deliberately invisible until explicit staging enablement.
    return NextResponse.json({ error: "Gmail povezivanje nije podešeno." }, { status: 503 });
  }
}
