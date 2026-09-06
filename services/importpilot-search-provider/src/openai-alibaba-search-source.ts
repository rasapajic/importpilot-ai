import type { SearchRequest, SupplierSearchResult } from "./contract.js";
import { createOpenAIWebSearchSource } from "./openai-web-search-source.js";
import type {
  SupplierSearchOutcome,
  SupplierSearchSource,
} from "./provider.js";

type OpenAIWebSearchOptions = NonNullable<
  Parameters<typeof createOpenAIWebSearchSource>[0]
>;

type OpenAIAlibabaSearchOptions = OpenAIWebSearchOptions;

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, reason: undefined, aiUsage: undefined }
    : outcome;
}

function isAlibabaHost(hostname: string) {
  return hostname === "alibaba.com" || hostname.endsWith(".alibaba.com");
}

export function isAlibabaProductUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !isAlibabaHost(hostname)) return false;
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return path.startsWith("/product-detail/") && path.length > "/product-detail/".length;
  } catch {
    return false;
  }
}

/**
 * Alibaba currently exposes some concrete indexed offers under
 * /product-introduction/<slug_or_id>.html as well as the older
 * /product-detail/ form. Both are product-specific pages on Alibaba-owned
 * hosts; category/search/country pages remain rejected.
 */
export function isAlibabaIndexedProductUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !isAlibabaHost(hostname)) return false;
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return ["/product-detail/", "/product-introduction/"].some(
      (prefix) => path.startsWith(prefix) && path.length > prefix.length,
    );
  } catch {
    return false;
  }
}

function uniqueQueries(queries: string[]) {
  return [...new Set(
    queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean),
  )].slice(0, 5);
}

function buildAlibabaSearchInput(input: SearchRequest): SearchRequest {
  const sourceQueries = input.queryVariants?.length
    ? input.queryVariants
    : [input.productQuery];
  const queryVariants = uniqueQueries(
    sourceQueries.map((query) => `${query} site:alibaba.com inurl:product-detail`),
  );
  const fallback = `${input.productQuery} site:alibaba.com inurl:product-detail`;
  return {
    ...input,
    productQuery: queryVariants[0] ?? fallback,
    queryVariants: queryVariants.length > 0 ? queryVariants : [fallback],
  };
}

function buildAlibabaIndexedSearchInput(input: SearchRequest): SearchRequest {
  const sourceQueries = input.queryVariants?.length
    ? input.queryVariants
    : [input.productQuery];
  const queryVariants = uniqueQueries([
    ...sourceQueries.slice(0, 2).map(
      (query) => `${query} site:alibaba.com inurl:product-introduction`,
    ),
    ...(sourceQueries[0]
      ? [`${sourceQueries[0]} site:wholesaler.alibaba.com inurl:product-detail`]
      : []),
  ]);
  const fallback = `${input.productQuery} site:alibaba.com inurl:product-introduction`;
  return {
    ...input,
    productQuery: queryVariants[0] ?? fallback,
    queryVariants: queryVariants.length > 0 ? queryVariants : [fallback],
  };
}

function normalizeAlibabaResult(result: SupplierSearchResult): SupplierSearchResult {
  return {
    ...result,
    source: "TAJA Alibaba",
  };
}

/**
 * AI-assisted Alibaba fallback used only after the direct Alibaba adapter
 * returns no usable cards. The first pass remains constrained to canonical
 * /product-detail/ pages. If Alibaba's current public index exposes no such
 * pages, one bounded second pass accepts only product-specific Alibaba-owned
 * /product-introduction/ pages (plus wholesaler.alibaba.com product-detail
 * pages). Search/category/RFQ/storefront pages and every non-Alibaba host stay
 * rejected. Unknown commercial fields remain null.
 */
export function createOpenAIAlibabaSearchSource(
  options: OpenAIAlibabaSearchOptions = {},
): SupplierSearchSource {
  const primarySource = createOpenAIWebSearchSource({
    ...options,
    maxResults: options.maxResults ?? 5,
    searchProfile: "alibaba_only",
    resultUrlPolicy: isAlibabaProductUrl,
  });
  const indexedFallbackSource = createOpenAIWebSearchSource({
    ...options,
    maxResults: options.maxResults ?? 5,
    searchProfile: "general",
    resultUrlPolicy: isAlibabaIndexedProductUrl,
  });

  return {
    name: "openai-alibaba-web-v1",
    implemented: primarySource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return primarySource.healthCheck ? primarySource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const primary = outcomeParts(await primarySource.search(
        buildAlibabaSearchInput(input),
        signal,
      ));
      if (primary.results.length > 0) {
        return {
          results: primary.results.map(normalizeAlibabaResult),
          ...(primary.reason ? { reason: primary.reason } : {}),
          ...(primary.aiUsage?.length ? { aiUsage: primary.aiUsage } : {}),
        };
      }

      const indexed = outcomeParts(await indexedFallbackSource.search(
        buildAlibabaIndexedSearchInput(input),
        signal,
      ));
      const aiUsage = [...(primary.aiUsage ?? []), ...(indexed.aiUsage ?? [])];
      return {
        results: indexed.results.map(normalizeAlibabaResult),
        ...(indexed.results.length === 0
          ? { reason: indexed.reason ?? primary.reason ?? "TAJA Alibaba search returned no verified indexed product pages." }
          : {}),
        ...(aiUsage.length ? { aiUsage } : {}),
      };
    },
  };
}
