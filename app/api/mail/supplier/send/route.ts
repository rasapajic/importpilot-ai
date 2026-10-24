import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  sendApprovedSupplierMail,
  SupplierMailAlreadyReservedError,
  SupplierMailDeliveryUncertainError,
  SupplierMailRequestDeniedError,
} from "@/modules/negotiation/application/connected-supplier-mail-service";
import {
  gmailAcceptanceEnabled,
  isTrustedGmailActionOrigin,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";

const schema = z.object({
  projectId: z.uuid(),
  productUrl: z.url().max(2000),
  approvalToken: z.string().min(40).max(8192),
  approved: z.literal(true),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (
    !isTrustedGmailActionOrigin(request.headers.get("origin")) ||
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return NextResponse.json({ error: "Ovaj korak nije dozvoljen." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neispravan zahtev." }, { status: 400 });

  try {
    const result = await sendApprovedSupplierMail({
      organizationId: auth.membership.organizationId,
      userId: auth.user.id,
    }, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SupplierMailAlreadyReservedError) {
      return NextResponse.json({
        error: "Pokušaj slanja je već evidentiran. Proverite poštu; ponovno slanje je blokirano.",
      }, { status: 409 });
    }
    if (error instanceof SupplierMailRequestDeniedError) {
      return NextResponse.json({
        error: "Promenjeni su podaci, poruka ili odobrenje. Ponovo pregledajte upit.",
      }, { status: 409 });
    }
    if (error instanceof SupplierMailDeliveryUncertainError) {
      return NextResponse.json({
        error: "Ishod slanja nije potvrđen. Proverite Gmail pre bilo kakvog ponovnog pokušaja.",
      }, { status: 502 });
    }
    return NextResponse.json({ error: "Gmail test nije dostupan." }, { status: 503 });
  }
}
