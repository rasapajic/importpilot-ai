import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  AssessmentOfferNotFoundError,
  assessSupplierOffer,
} from "@/modules/intelligence/application/assessment-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    return NextResponse.json(
      await assessSupplierOffer((await params).offerId, auth.membership.organizationId),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AssessmentOfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena." }, { status: 404 });
    }
    throw error;
  }
}

