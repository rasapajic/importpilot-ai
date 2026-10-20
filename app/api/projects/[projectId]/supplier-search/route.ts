import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { getServerLocale } from "@/modules/i18n/server";
import {
  SupplierSearchRequestTimeoutError,
  withSearchDeadline,
} from "@/modules/product-search/application/search-deadline";
import {
  ProductSearchProjectNotFoundError,
  searchProjectSupplierOffers,
} from "@/modules/product-search/application/product-search-service";
import { projectSupplierSearchRequestSchema } from "@/modules/product-search/domain/search";
import {
  SupplierSearchProviderError,
  SupplierSearchProviderTimeoutError,
  SupplierSearchProviderUnavailableError,
} from "@/modules/product-search/infrastructure/http-provider";
import type { SupplierSearchFailureCode } from "@/modules/product-search/domain/search-outcome";
import {
  releaseSupplierSearchQuotaReservation,
  reserveMonthlySupplierSearchQuota,
  SupplierSearchQuotaExceededError,
  SupplierSearchQuotaProjectNotFoundError,
  type SupplierSearchQuotaReservation,
  type SupplierSearchQuotaStatus,
} from "@/modules/subscriptions/application/supplier-search-quota-service";

const SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS = 60_000;

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

function failedSearchResponse(
  failureCode: SupplierSearchFailureCode,
  error: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({
    results: [],
    resultOrigin: null,
    liveProviderFailed: true,
    cacheHit: false,
    returnedFromCache: false,
    searchDisposition: "failed",
    failureCode,
    error,
    ...extra,
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

    developmentLog("supplier_search_request_started", {
      project_id: projectId,
      quota_plan: quotaReservation.plan,
      quota_used: quotaReservation.used,
      quota_limit: quotaReservation.limit,
      quota_source: quotaReservation.source,
      exact_page_enrichment: "deferred_until_offer_selection",
      request_timeout_ms: SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS,
    });

    const outcome = await withSearchDeadline(
      (signal) => searchProjectSupplierOffers(
        projectId,
        auth.membership.organizationId,
        parsed.data,
        undefined,
        null,
        { signal },
      ),
      SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS,
    );
    developmentLog("supplier_search_request_completed", {
      project_id: projectId,
      duration_ms: Date.now() - startedAt,
      result_count: outcome.results.length,
      exact_page_enrichment: "deferred_until_offer_selection",
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
      return failedSearchResponse(
        "timeout",
        "Pretraga je trajala predugo i prekinuta je. Sačuvane ponude nisu prikazane kao nove, a cena nije izmišljena.",
      );
    }
    if (error instanceof SupplierSearchProviderUnavailableError) {
      return failedSearchResponse("no_verified_offers", error.reason, {
        reason: error.reason,
        ...developmentStatus("connected"),
      });
    }
    if (
      error instanceof SupplierSearchProviderTimeoutError ||
      error instanceof SupplierSearchProviderError
    ) {
      return failedSearchResponse("provider_error", "Pretraga trenutno nije dostupna. Pokušajte ponovo.", {
        ...developmentStatus(error instanceof SupplierSearchProviderTimeoutError ? "connected" : "error"),
      });
    }
    return NextResponse.json(
      { error: "Pretraga trenutno nije dostupna. Pokušajte ponovo." },
      { status: 502 },
    );
  }
}
