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

export function isAlibabaProductUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "alibaba.com" && !hostname.endsWith(".alibaba.com"))
    ) {
      return false;
    }
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return path.startsWith("/product-detail/") && path.length > "/product-detail/".length;
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

function normalizeAlibabaResult(result: SupplierSearchResult): SupplierSearchResult {
  return {
    ...result,
    source: "TAJA Alibaba",
  };
}

/**
 * AI-assisted Alibaba fallback used only after the direct Alibaba adapter
 * returns no usable cards. Search queries and the model prompt are constrained
 * to product-detail pages, and every accepted URL must be both cited and pass
 * the strict Alibaba product URL policy enforced by the shared web-search
 * source. Unknown commercial fields remain null instead of causing an otherwise
 * verified product page to be discarded.
 */
export function createOpenAIAlibabaSearchSource(
  options: OpenAIAlibabaSearchOptions = {},
): SupplierSearchSource {
  const baseSource = createOpenAIWebSearchSource({
    ...options,
    maxResults: options.maxResults ?? 5,
    searchProfile: "alibaba_only",
    resultUrlPolicy: isAlibabaProductUrl,
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
