import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  ProductSearchProjectNotFoundError,
  searchProjectSupplierOffers,
} from "@/modules/product-search/application/product-search-service";
import { projectSupplierSearchRequestSchema } from "@/modules/product-search/domain/search";
import {
  createDetailedSupplierOfferUrlImportProvider,
} from "@/modules/product-search/infrastructure/detailed-url-import-provider";
import {
  createFinalistUrlEnrichmentProvider,
  TAJA_FINALIST_EXACT_PAGE_LIMIT,
  TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS,
} from "@/modules/product-search/infrastructure/finalist-url-enrichment-provider";
import {
  SupplierSearchProviderError,
  SupplierSearchProviderUnavailableError,
} from "@/modules/product-search/infrastructure/http-provider";

const SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS = 60_000;

class SupplierSearchRequestTimeoutError extends Error {
  constructor() {
    super("Supplier search request exceeded its maximum duration.");
    this.name = "SupplierSearchRequestTimeoutError";
  }
}

function developmentStatus(status: "connected" | "not_configured" | "error") {
  return process.env.NODE_ENV === "development" ? { providerStatus: status } : {};
}

function developmentLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({ service: "importpilot-app", event, ...details }));
}

function withSearchDeadline<T>(operation: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new SupplierSearchRequestTimeoutError()),
      SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS,
    );
  });

  return Promise.race([operation, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
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

  const startedAt = Date.now();
  const exactPageProvider = createFinalistUrlEnrichmentProvider(
    createDetailedSupplierOfferUrlImportProvider({
      requestedQuantity: parsed.data.quantity,
      timeoutMs: TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS,
    }),
    TAJA_FINALIST_EXACT_PAGE_LIMIT,
  );

  developmentLog("supplier_search_request_started", {
    project_id: (await params).projectId,
    exact_page_finalist_limit: TAJA_FINALIST_EXACT_PAGE_LIMIT,
    exact_page_timeout_ms: TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS,
    request_timeout_ms: SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS,
  });

  try {
    const projectId = (await params).projectId;
    const outcome = await withSearchDeadline(
      searchProjectSupplierOffers(
        projectId,
        auth.membership.organizationId,
        parsed.data,
        undefined,
        exactPageProvider,
      ),
    );
    developmentLog("supplier_search_request_completed", {
      project_id: projectId,
      duration_ms: Date.now() - startedAt,
      result_count: outcome.results.length,
      exact_page_finalist_limit: TAJA_FINALIST_EXACT_PAGE_LIMIT,
    });
    return NextResponse.json({
      ...outcome,
      ...developmentStatus(
        process.env.SUPPLIER_SEARCH_PROVIDER_URL ? "connected" : "not_configured",
      ),
    });
  } catch (error) {
    const projectId = (await params).projectId;
    developmentLog("supplier_search_request_failed", {
      project_id: projectId,
      duration_ms: Date.now() - startedAt,
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    if (error instanceof ProductSearchProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof SupplierSearchRequestTimeoutError) {
      return NextResponse.json(
        {
          error: "Pretraga je trajala predugo i prekinuta je. Pokušajte ponovo ili uvezite konkretnu ponudu iz linka.",
        },
        { status: 504 },
      );
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
