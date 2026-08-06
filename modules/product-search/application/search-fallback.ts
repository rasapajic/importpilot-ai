import {
  supplierOfferSearchResultsSchema,
  supplierOfferSearchSummarySchema,
  type SupplierOfferSearchInput,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchProviderOutcome,
  type SupplierOfferSearchResult,
  type SupplierOfferSearchSummary,
} from "../domain/search";
import {
  findLastSuccessfulSupplierSearch,
  storeSuccessfulSupplierSearch,
} from "../infrastructure/persistent-cache";

export type ProjectSupplierSearchOutcome = {
  results: SupplierOfferSearchResult[];
  summary?: SupplierOfferSearchSummary;
  resultOrigin: "live" | "cache" | null;
  liveProviderFailed: boolean;
  cacheHit: boolean;
  returnedFromCache: boolean;
};

type SupplierSearchCacheAccess = {
  store: typeof storeSuccessfulSupplierSearch;
  find: typeof findLastSuccessfulSupplierSearch;
};

function providerOutcomeParts(outcome: SupplierOfferSearchProviderOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, summary: undefined }
    : outcome;
}

function developmentLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({
    service: "importpilot-app",
    event,
    ...details,
  }));
}

export async function searchSupplierOffersWithPersistentFallback(
  input: SupplierOfferSearchInput,
  provider: SupplierOfferSearchProvider,
  cache: SupplierSearchCacheAccess = {
    store: storeSuccessfulSupplierSearch,
    find: findLastSuccessfulSupplierSearch,
  },
) {
  try {
    const providerOutcome = providerOutcomeParts(
      await provider.searchSupplierOffers(input),
    );
    const results = supplierOfferSearchResultsSchema.parse(providerOutcome.results);
    const summary = providerOutcome.summary
      ? supplierOfferSearchSummarySchema.parse(providerOutcome.summary)
      : undefined;
    if (results.length > 0) {
      await cache.store(input, results).catch((error: unknown) => {
        developmentLog("supplier_search_cache_write_failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      });
      developmentLog("supplier_search_complete", {
        live_provider_failed: false,
        cache_hit: false,
        returned_from_cache: false,
        result_count: results.length,
        deep_search_summary: Boolean(summary),
      });
      return {
        results,
        ...(summary ? { summary } : {}),
        resultOrigin: "live",
        liveProviderFailed: false,
        cacheHit: false,
        returnedFromCache: false,
      } satisfies ProjectSupplierSearchOutcome;
    }

    developmentLog("supplier_search_live_provider_failed", {
      reason: "Live provider returned no usable results.",
    });
    const cached = await cache.find(input).catch(() => null);
    developmentLog(cached ? "supplier_search_cache_hit" : "supplier_search_cache_miss", {
      returned_from_cache: Boolean(cached),
    });
    return {
      results: cached?.results ?? [],
      resultOrigin: cached ? "cache" : null,
      liveProviderFailed: true,
      cacheHit: Boolean(cached),
      returnedFromCache: Boolean(cached),
    } satisfies ProjectSupplierSearchOutcome;
  } catch (error) {
    developmentLog("supplier_search_live_provider_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    const cached = await cache.find(input).catch(() => null);
    developmentLog(cached ? "supplier_search_cache_hit" : "supplier_search_cache_miss", {
      returned_from_cache: Boolean(cached),
    });
    if (!cached) throw error;
    return {
      results: cached.results,
      resultOrigin: "cache",
      liveProviderFailed: true,
      cacheHit: true,
      returnedFromCache: true,
    } satisfies ProjectSupplierSearchOutcome;
  }
}
