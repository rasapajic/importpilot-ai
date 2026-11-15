import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  supplierOfferSearchResultsSchema,
} from "@/modules/product-search/domain/search";
import {
  eligibleExactProductPage,
  recoverCachedExactSourceImage,
} from "@/modules/product-search/infrastructure/public-source-image";

export const runtime = "nodejs";

const requestSchema = z.object({
  productUrl: z.string().url().max(2_000),
  title: z.string().trim().min(3).max(300),
}).strict();

// Server-only, bounded. This is metadata recovery for cached supplier-search
// results, not an arbitrary URL previewer or image proxy.
const perOrganization = new Map<string, { startedAt: number; count: number }>();
function withinSourceImageBudget(organizationId: string) {
  const now = Date.now();
  if (perOrganization.size > 400) perOrganization.clear();
  const usage = perOrganization.get(organizationId);
  if (!usage || now - usage.startedAt >= 60_000) {
    perOrganization.set(organizationId, { startedAt: now, count: 1 });
    return true;
  }
  if (usage.count >= 20) return false;
  usage.count += 1;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !eligibleExactProductPage(parsed.data?.productUrl ?? "")) {
    return NextResponse.json({ imageUrl: null, reason: "unsupported_source" }, { status: 422 });
  }
  const { projectId } = await params;
  const organizationId = auth.membership.organizationId;
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });

  if (!withinSourceImageBudget(organizationId)) {
    return NextResponse.json({ imageUrl: null, reason: "rate_limited" }, { status: 429 });
  }

  // Only source links and titles that already appear in an unexpired,
  // provider-generated search result are eligible. User-supplied arbitrary
  // URLs are never visited. No supplier price / MOQ / source record is edited.
  const cached = await prisma.supplierSearchCache.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { resultsJson: true },
  });
  const exactMatch = cached.some((entry) => {
    const results = supplierOfferSearchResultsSchema.safeParse(entry.resultsJson);
    return results.success && results.data.some((result) =>
      result.productUrl === parsed.data.productUrl &&
      result.title === parsed.data.title);
  });
  if (!exactMatch) {
    return NextResponse.json({ imageUrl: null, reason: "not_from_search" }, { status: 404 });
  }

  const imageUrl = await recoverCachedExactSourceImage(
    parsed.data.productUrl,
    parsed.data.title,
  );
  return NextResponse.json({
    imageUrl,
    provenance: imageUrl ? "exact_source_page_metadata" : null,
  }, { headers: { "cache-control": "private, no-store" } });
}
