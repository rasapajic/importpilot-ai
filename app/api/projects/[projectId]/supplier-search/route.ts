import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { getServerLocale } from "@/modules/i18n/server";
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
import {
  releaseSupplierSearchQuotaReservation,
  reserveMonthlySupplierSearchQuota,
  SupplierSearchQuotaExceededError,
  SupplierSearchQuotaProjectNotFoundError,
  type SupplierSearchQuotaReservation,
  type SupplierSearchQuotaStatus,
} from "@/modules/subscriptions/application/supplier-search-quota-service";

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


function serializedQuota(quota: SupplierSearchQuotaStatus) {
  return {
    plan: quota.plan,
    used: quota.used,
    limit: quota.limit,
    remaining: quota.remaining,
    periodStart: quota.periodStart.toISOString(),
    periodEnd: quota.periodEnd.toISOString(),
  };
}

async function quotaExceededMessage(quota: SupplierSearchQuotaStatus) {
  const locale = await getServerLocale();
  if (locale === "de") {
    return `Monatliches Suchlimit erreicht (${quota.used}/${quota.limit}). Gespeicherte Projekte und Ergebnisse bleiben verfügbar.`;
  }
  if (locale === "en") {
    return `Monthly search limit reached (${quota.used}/${quota.limit}). Saved projects and results remain available.`;
  }
  return `Mesečni limit pretraga je potrošen (${quota.used}/${quota.limit}). Sačuvani projekti i rezultati ostaju dostupni.`;
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
  const projectId = (await params).projectId;
  let quotaReservation: SupplierSearchQuotaReservation | null = null;

  try {
    quotaReservation = await reserveMonthlySupplierSearchQuota({
      organizationId: auth.membership.organizationId,
      projectId,
    });

    const exactPageProvider = createFinalistUrlEnrichmentProvider(
      createDetailedSupplierOfferUrlImportProvider({
        requestedQuantity: parsed.data.quantity,
        timeoutMs: TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS,
      }),
      TAJA_FINALIST_EXACT_PAGE_LIMIT,
    );

    developmentLog("supplier_search_request_started", {
      project_id: projectId,
      quota_plan: quotaReservation.plan,
      quota_used: quotaReservation.used,
      quota_limit: quotaReservation.limit,
      quota_source: quotaReservation.source,
      exact_page_finalist_limit: TAJA_FINALIST_EXACT_PAGE_LIMIT,
      exact_page_timeout_ms: TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS,
      request_timeout_ms: SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS,
    });

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
      quota: serializedQuota(quotaReservation),
      ...developmentStatus(
        process.env.SUPPLIER_SEARCH_PROVIDER_URL ? "connected" : "not_configured",
      ),
    });
  } catch (error) {
    developmentLog("supplier_search_request_failed", {
      project_id: projectId,
      duration_ms: Date.now() - startedAt,
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    if (error instanceof SupplierSearchQuotaExceededError) {
      return NextResponse.json(
        {
          code: "SEARCH_LIMIT_REACHED",
          error: await quotaExceededMessage(error.quota),
          quota: serializedQuota(error.quota),
        },
        { status: 429 },
      );
    }
    if (error instanceof SupplierSearchQuotaProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }

    if (quotaReservation) {
      await releaseSupplierSearchQuotaReservation({
        organizationId: auth.membership.organizationId,
        reservation: quotaReservation,
      }).catch((releaseError: unknown) => {
        developmentLog("supplier_search_quota_release_failed", {
          project_id: projectId,
          error_name: releaseError instanceof Error ? releaseError.name : "UnknownError",
        });
      });
    }

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
