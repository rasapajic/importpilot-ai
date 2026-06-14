import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  changeProjectCompletion,
  FeedbackProjectNotFoundError,
} from "@/modules/feedback/application/feedback-service";
import { projectCompletionSchema } from "@/modules/feedback/domain/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = projectCompletionSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Status projekta nije validan." }, { status: 400 });
  try {
    return NextResponse.json(
      await changeProjectCompletion((await params).projectId, auth.membership.organizationId, result.data),
    );
  } catch (error) {
    if (error instanceof FeedbackProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    throw error;
  }
}
