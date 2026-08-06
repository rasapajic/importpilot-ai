import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { getAiUsageSummary } from "@/modules/ai-usage/application/ai-usage-service";

function optionalDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || undefined;
  const from = optionalDate(request.nextUrl.searchParams.get("from"));
  const to = optionalDate(request.nextUrl.searchParams.get("to"));
  if (from === null || to === null) {
    return NextResponse.json(
      { error: "Datumi moraju biti u važećem ISO formatu." },
      { status: 400 },
    );
  }
  if (from && to && from >= to) {
    return NextResponse.json(
      { error: "Početni datum mora biti pre završnog datuma." },
      { status: 400 },
    );
  }

  const summary = await getAiUsageSummary({
    organizationId: auth.membership.organizationId,
    projectId,
    from,
    to,
  });
  return NextResponse.json(summary);
}
