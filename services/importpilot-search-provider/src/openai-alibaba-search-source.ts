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
  const primary = sourceQueries[0] ?? input.productQuery;
  const secondary = sourceQueries[1];
  const queryVariants = uniqueQueries([
    `${primary} site:alibaba.com inurl:product-introduction`,
    `${primary} site:alibaba.com inurl:product-detail`,
    ...(secondary ? [
      `${secondary} site:alibaba.com inurl:product-introduction`,
      `${secondary} site:alibaba.com inurl:product-detail`,
    ] : []),
    `${primary} site:wholesaler.alibaba.com inurl:product-detail`,
  ]);
  return {
    ...input,
    productQuery: queryVariants[0],
    queryVariants,
  };
}

function normalizeAlibabaResult(result: SupplierSearchResult): SupplierSearchResult {
  return {
    ...result,
    source: "TAJA Alibaba",
  };
}

/**
 * AI-assisted Alibaba fallback used only after the direct Alibaba HTML adapter
 * returns no usable cards. Public search indexing has shifted many current
 * concrete offers from /product-detail/ to /product-introduction/, so one
 * bounded OpenAI web-search pass now searches both product-specific forms.
 * A strict URL policy still rejects search/category/RFQ/storefront pages and
 * every non-Alibaba host. Unknown commercial fields remain null.
 */
export function createOpenAIAlibabaSearchSource(
  options: OpenAIAlibabaSearchOptions = {},
): SupplierSearchSource {
  const baseSource = createOpenAIWebSearchSource({
    ...options,
    maxResults: options.maxResults ?? 5,
    searchProfile: "general",
    resultUrlPolicy: isAlibabaIndexedProductUrl,
  });

  return {
    name: "openai-alibaba-web-v1",
    implemented: baseSource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return baseSource.healthCheck ? baseSource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const outcome = outcomeParts(await baseSource.search(
        buildAlibabaSearchInput(input),
        signal,
      ));
      return {
        results: outcome.results.map(normalizeAlibabaResult),
        ...(outcome.reason ? { reason: outcome.reason } : {}),
        ...(outcome.aiUsage?.length ? { aiUsage: outcome.aiUsage } : {}),
      };
    },
  };
}
