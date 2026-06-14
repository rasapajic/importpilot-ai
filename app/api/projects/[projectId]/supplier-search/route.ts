import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  ProductSearchProjectNotFoundError,
  searchProjectSupplierOffers,
} from "@/modules/product-search/application/product-search-service";
import { projectSupplierSearchRequestSchema } from "@/modules/product-search/domain/search";
import {
  SupplierSearchProviderError,
  SupplierSearchProviderUnavailableError,
} from "@/modules/product-search/infrastructure/http-provider";

function developmentStatus(status: "connected" | "not_configured" | "error") {
  return process.env.NODE_ENV === "development" ? { providerStatus: status } : {};
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = projectSupplierSearchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Proverite proizvod, količinu i ciljnu zemlju." },
      { status: 400 },
    );
  }

  try {
    const outcome = await searchProjectSupplierOffers(
      (await params).projectId,
      auth.membership.organizationId,
      parsed.data,
    );
    return NextResponse.json({
      ...outcome,
      ...developmentStatus(
        process.env.SUPPLIER_SEARCH_PROVIDER_URL ? "connected" : "not_configured",
      ),
    });
  } catch (error) {
    if (error instanceof ProductSearchProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof SupplierSearchProviderUnavailableError) {
      return NextResponse.json({
        results: [],
        reason: error.reason,
        ...developmentStatus("connected"),
      });
    }
    if (error instanceof SupplierSearchProviderError) {
      return NextResponse.json({ results: [], ...developmentStatus("error") });
    }
    return NextResponse.json(
      { error: "Pretraga trenutno nije dostupna. Pokušajte ponovo." },
      { status: 502 },
    );
  }
}
