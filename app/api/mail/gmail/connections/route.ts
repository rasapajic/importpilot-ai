import { NextResponse } from "next/server";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { listConnectedGmailMailboxes } from "@/modules/negotiation/application/connected-supplier-mail-service";
import { gmailAcceptanceEnabled } from "@/modules/negotiation/infrastructure/gmail-acceptance-config";

export async function GET() {
  const auth = await getCurrentSession();
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return NextResponse.json({ connections: [], enabled: false });

  const connections = await listConnectedGmailMailboxes({
    organizationId: auth.membership.organizationId,
    userId: auth.user.id,
  });
  return NextResponse.json({ enabled: true, connections }, {
    headers: { "Cache-Control": "no-store" },
  });
}
