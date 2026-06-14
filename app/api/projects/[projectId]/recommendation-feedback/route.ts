import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  FeedbackDecisionNotFoundError,
  recordRecommendationFeedback,
} from "@/modules/feedback/application/feedback-service";
import { recommendationFeedbackSchema } from "@/modules/feedback/domain/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const result = recommendationFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Feedback nije validan." }, { status: 400 });
  try {
    return NextResponse.json(
      await recordRecommendationFeedback((await params).projectId, auth.membership.organizationId, result.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof FeedbackDecisionNotFoundError) {
      return NextResponse.json({ error: "Prvo generišite finalnu preporuku projekta." }, { status: 400 });
    }
    throw error;
  }
}
