import { NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { listGmailMailboxConnections } from "@/modules/negotiation/application/gmail-mailbox-connection-service";
import { assessGmailConnectionListing } from "@/modules/negotiation/infrastructure/gmail-acceptance-gate";
import { gmailConnectionConfig } from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

export async function GET() {
  const auth = await getCurrentSession();
  const admission = assessGmailConnectionListing({
    userId: auth?.user.id ?? null,
    organizationId: auth?.membership.organizationId ?? null,
    role: auth?.membership.role ?? null,
  });
  if (!admission.ok || !auth) {
    const status = admission.ok ? 401 : admission.status;
    const error = admission.ok ? "Prijava je potrebna." : admission.error;
    return NextResponse.json({ error }, { status });
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
