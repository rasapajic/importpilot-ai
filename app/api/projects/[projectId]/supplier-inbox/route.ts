import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { getProjectSupplierInbox } from "@/modules/supplier-inbox/application/inbox-query";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const inbox = await getProjectSupplierInbox((await params).projectId, auth.membership.organizationId);
  if (!inbox) return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
  return NextResponse.json(inbox);
}
