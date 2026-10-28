import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  acknowledgeUnverifiedSender,
  confirmWrittenQuote,
  reviewQuoteField,
} from "@/modules/supplier-inbox/application/review-service";
import { QuoteReviewError, SupplierInboxNotFoundError } from "@/modules/supplier-inbox/domain/errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const { projectId } = await params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const organizationId = auth.membership.organizationId;
  const userId = auth.user.id;

  try {
    if (action === "accept" || action === "reject") {
      await reviewQuoteField({
        organizationId,
        projectId,
        extractionId: String(form.get("extractionId") ?? ""),
        reviewerUserId: userId,
        decision: action === "accept" ? "ACCEPTED" : "REJECTED",
      });
    } else if (action === "acknowledge") {
      await acknowledgeUnverifiedSender({
        organizationId,
        projectId,
        threadId: String(form.get("threadId") ?? ""),
        userId,
      });
    } else if (action === "confirm") {
      await confirmWrittenQuote({
        organizationId,
        projectId,
        threadId: String(form.get("threadId") ?? ""),
        userId,
      });
    } else {
      return NextResponse.json({ error: "Nepoznata radnja." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof SupplierInboxNotFoundError) {
      return NextResponse.json({ error: "Sanduče nije pronađeno." }, { status: 404 });
    }
    if (error instanceof QuoteReviewError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.redirect(new URL(`/projects/${projectId}/inbox`, request.url), 303);
}
