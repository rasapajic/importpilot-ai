import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  OfferNotFoundError,
  updateOfferCommercialTerms,
} from "@/modules/offers/application/offer-service";
import { commercialTermsSchema } from "@/modules/offers/domain/offer-validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = commercialTermsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Proverite cenu, valutu i Incoterm." },
      { status: 400 },
    );
  }

  try {
    const offer = await updateOfferCommercialTerms(
      (await params).offerId,
      auth.membership.organizationId,
      parsed.data,
    );
    return NextResponse.json(offer);
  } catch (error) {
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena." }, { status: 404 });
    }
    throw error;
  }
}
