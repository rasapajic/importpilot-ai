import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  markNegotiationMessageSent,
  NegotiationMessageNotFoundError,
} from "@/modules/negotiation/application/negotiation-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  try {
    await markNegotiationMessageSent(
      (await params).messageId,
      auth.membership.organizationId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NegotiationMessageNotFoundError) {
      return NextResponse.json({ error: "Poruka nije pronađena." }, { status: 404 });
    }
    throw error;
  }
}

