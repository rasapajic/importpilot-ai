import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  deleteManualOffer,
  OfferNotFoundError,
  updateManualOffer,
} from "@/modules/offers/application/offer-service";
import { manualOfferSchema } from "@/modules/offers/domain/offer-validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = manualOfferSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await updateManualOffer(
        (await params).offerId,
        auth.membership.organizationId,
        result.data,
      ),
    );
  } catch (error) {
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena." }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  try {
    await deleteManualOffer((await params).offerId, auth.membership.organizationId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena." }, { status: 404 });
    }
    throw error;
  }
}

