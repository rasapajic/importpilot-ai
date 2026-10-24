import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  previewSupplierMail,
  SupplierMailAlreadyReservedError,
  SupplierMailRequestDeniedError,
} from "@/modules/negotiation/application/connected-supplier-mail-service";
import {
  gmailAcceptanceEnabled,
  isTrustedGmailActionOrigin,
} from "@/modules/negotiation/infrastructure/gmail-acceptance-config";

const schema = z.object({
  projectId: z.uuid(),
  productUrl: z.url().max(2000),
  connectionId: z.uuid(),
  recipient: z.email().max(320),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (
    !isTrustedGmailActionOrigin(request.headers.get("origin")) ||
    auth.membership.role !== "OWNER" ||
    !gmailAcceptanceEnabled(auth.membership.organizationId)
  ) return NextResponse.json({ error: "Funkcija nije dostupna." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Proverite podatke." }, { status: 400 });

  try {
    const preview = await previewSupplierMail({
      organizationId: auth.membership.organizationId,
      userId: auth.user.id,
    }, parsed.data);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const conflict = error instanceof SupplierMailAlreadyReservedError ||
      error instanceof SupplierMailRequestDeniedError;
    return NextResponse.json({
      error: conflict
        ? "Upit nije spreman, nije sveže preveden ili je već poslat."
        : "Gmail test nije podešen ili testni primalac nije dozvoljen.",
    }, { status: conflict ? 409 : 503 });
  }
}
