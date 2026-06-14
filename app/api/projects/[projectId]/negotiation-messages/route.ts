import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  createNegotiationMessage,
  NegotiationDecisionNotFoundError,
} from "@/modules/negotiation/application/negotiation-service";
import { negotiationToneSchema } from "@/modules/negotiation/domain/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = negotiationToneSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Ton poruke nije validan." }, { status: 400 });

  try {
    return NextResponse.json(
      await createNegotiationMessage(
        (await params).projectId,
        auth.membership.organizationId,
        result.data.tone,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof NegotiationDecisionNotFoundError) {
      return NextResponse.json(
        { error: "Prvo izaberite opciju „Pregovaraj“ da biste dobili predlog poruke." },
        { status: 400 },
      );
    }
    throw error;
  }
}
