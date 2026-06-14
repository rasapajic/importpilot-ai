import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  DecisionProjectNotFoundError,
  generateProjectDecision,
} from "@/modules/decisions/application/project-decision-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    return NextResponse.json(
      await generateProjectDecision(
        (await params).projectId,
        auth.membership.organizationId,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DecisionProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    throw error;
  }
}

