import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  FeedbackProjectNotFoundError,
  recordProjectOutcome,
} from "@/modules/feedback/application/feedback-service";
import { projectOutcomeSchema } from "@/modules/feedback/domain/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = projectOutcomeSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Podaci o ishodu nisu validni." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await recordProjectOutcome((await params).projectId, auth.membership.organizationId, result.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof FeedbackProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    throw error;
  }
}
