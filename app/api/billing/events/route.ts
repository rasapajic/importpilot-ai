import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { applyBillingEvent } from "@/modules/subscriptions/application/billing-service";

function authorized(request: NextRequest) {
  const configured = process.env.BILLING_EVENT_TOKEN?.trim();
  if (!configured) return false;
  const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = createHash("sha256").update(configured).digest();
  const right = createHash("sha256").update(value).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!process.env.BILLING_EVENT_TOKEN?.trim()) {
    return NextResponse.json({ code: "BILLING_EVENTS_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const outcome = await applyBillingEvent(await request.json().catch(() => null));
    return NextResponse.json(outcome, { status: outcome.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "BILLING_EVENT_REJECTED",
        error: error instanceof Error ? error.message : "Invalid billing event.",
      },
      { status: 400 },
    );
  }
}
