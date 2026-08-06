import type {
  SearchRequest,
  SupplierSearchResult,
} from "./contract.js";
import { createOpenAIWebSearchSource } from "./openai-web-search-source.js";
import type {
  SupplierSearchOutcome,
  SupplierSearchSource,
} from "./provider.js";

type OpenAIWebSearchOptions = NonNullable<
  Parameters<typeof createOpenAIWebSearchSource>[0]
>;

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, reason: undefined, aiUsage: undefined }
    : outcome;
}

function is1688Host(productUrl: string) {
  try {
    const hostname = new URL(productUrl).hostname.toLowerCase();
    return hostname === "1688.com" || hostname.endsWith(".1688.com");
  } catch {
    return false;
  }
}

function normalize1688Result(result: SupplierSearchResult): SupplierSearchResult {
  return {
    ...result,
    source: "TAJA 1688",
  };
}

function build1688Query(input: SearchRequest) {
  return [
    input.productQuery,
    "1688 中国 批发 厂家 工厂 货源",
    "site:1688.com",
  ].join(" ");
}

/**
 * Dedicated 1688 discovery pass for TAJA Deep Search.
 *
 * Phase 1 uses OpenAI live web search as the browser layer, forces a
 * 1688-specific bilingual query and accepts only direct 1688 product pages.
 * A direct authenticated 1688 integration can replace this source later
 * without changing the multi-source collector contract.
 */
export function createOpenAI1688SearchSource(
  options: OpenAIWebSearchOptions = {},
): SupplierSearchSource {
  const baseSource = createOpenAIWebSearchSource({
    ...options,
    maxResults: options.maxResults ?? 10,
  });

  return {
    name: "openai-1688-web-v1",
    implemented: baseSource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return baseSource.healthCheck ? baseSource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const outcome = outcomeParts(await baseSource.search({
        ...input,
        productQuery: build1688Query(input),
      }, signal));
      const results = outcome.results
        .filter((result) => is1688Host(result.productUrl))
        .map(normalize1688Result);

      return results.length > 0
        ? {
            results,
            ...(outcome.aiUsage?.length ? { aiUsage: outcome.aiUsage } : {}),
          }
        : {
            results: [],
            reason: outcome.reason ?? "TAJA 1688 search returned no verified direct product pages.",
            ...(outcome.aiUsage?.length ? { aiUsage: outcome.aiUsage } : {}),
          };
    },
  };
}
