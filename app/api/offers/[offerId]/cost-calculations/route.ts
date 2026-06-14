import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  CostOfferNotFoundError,
  createCostCalculation,
  IncompleteOfferError,
} from "@/modules/cost-engine/application/cost-service";
import { costCalculationRequestSchema } from "@/modules/cost-engine/domain/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = costCalculationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }

  try {
    const calculation = await createCostCalculation(
      (await params).offerId,
      auth.membership.organizationId,
      result.data,
    );
    return NextResponse.json(calculation, { status: 201 });
  } catch (error) {
    if (error instanceof CostOfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena." }, { status: 404 });
    }
    if (error instanceof IncompleteOfferError) {
      return NextResponse.json(
        { error: "Ponuda mora imati cenu, valutu i Incoterm." },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

