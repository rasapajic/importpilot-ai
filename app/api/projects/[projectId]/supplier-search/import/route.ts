import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  importSearchResult,
  ProductSearchProjectNotFoundError,
} from "@/modules/product-search/application/product-search-service";
import { supplierOfferSearchResultSchema } from "@/modules/product-search/domain/search";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = supplierOfferSearchResultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Neispravna ponuda." },
      { status: 400 },
    );
  }

  try {
    const offer = await importSearchResult(
      (await params).projectId,
      auth.membership.organizationId,
      parsed.data,
    );
    return NextResponse.json({ offerId: offer.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ProductSearchProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    throw error;
  }
}
