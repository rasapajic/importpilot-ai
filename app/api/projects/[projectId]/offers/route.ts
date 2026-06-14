import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  createManualOffer,
  OfferProjectNotFoundError,
} from "@/modules/offers/application/offer-service";
import { manualOfferSchema } from "@/modules/offers/domain/offer-validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
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
    const offer = await createManualOffer(
      (await params).projectId,
      auth.membership.organizationId,
      result.data,
    );
    return NextResponse.json(offer, { status: 201 });
  } catch (error) {
    if (error instanceof OfferProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    throw error;
  }
}

