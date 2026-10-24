import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { disconnectGmailMailbox } from "@/modules/negotiation/application/connected-supplier-mail-service";
import {
  gmailAcceptanceEnabled,
  isTrustedGmailActionOrigin,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";

const bodySchema = z.object({ connectionId: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (
    !isTrustedGmailActionOrigin(request.headers.get("origin")) ||
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return NextResponse.json({ error: "Ovaj korak nije dozvoljen." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neispravan zahtev." }, { status: 400 });
  try {
    const result = await disconnectGmailMailbox({
      organizationId: auth.membership.organizationId,
      userId: auth.user.id,
    }, parsed.data.connectionId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Gmail veza nije mogla biti prekinuta." }, { status: 409 });
  }
}
