import type {
  AiUsageReport,
  SearchRequest,
  SupplierSearchResult,
} from "./contract.js";
import {
  createOpenAI1688Enricher,
  type Supplier1688Enricher,
} from "./openai-1688-enrichment.js";
import { createOpenAIWebSearchSource } from "./openai-web-search-source.js";
import type {
  SupplierSearchOutcome,
  SupplierSearchSource,
} from "./provider.js";

type OpenAIWebSearchOptions = NonNullable<
  Parameters<typeof createOpenAIWebSearchSource>[0]
>;

type OpenAI1688SearchOptions = OpenAIWebSearchOptions & {
  enrichmentMaxResults?: number;
  enrichmentTimeoutMs?: number;
  enricher?: Supplier1688Enricher;
};

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, reason: undefined, aiUsage: undefined }
    : outcome;
}

export function is1688ProductUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "1688.com" && !hostname.endsWith(".1688.com"))
    ) {
      return false;
    }
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return /^\/offer\/\d+(?:\.html?)?$/.test(path);
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

function positive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasUsableLogistics(result: SupplierSearchResult) {
  const logistics = result.supplierLogistics;
  if (!logistics) return false;
  const completeCarton =
    (positive(logistics.grossWeightKg) || positive(logistics.netWeightKg)) &&
    positive(logistics.cartonLengthCm) &&
    positive(logistics.cartonWidthCm) &&
    positive(logistics.cartonHeightCm) &&
    positive(logistics.piecesPerCarton);
  const completeUnit =
    positive(logistics.unitWeightKg) && positive(logistics.unitVolumeCbm);
  return completeCarton || completeUnit;
}

/** Removes only unusable partial logistics before the enrichment merge. */
export function prepare1688ResultsForEnrichment(results: SupplierSearchResult[]) {
  return results.map((result) =>
    result.supplierLogistics && !hasUsableLogistics(result)
      ? { ...result, supplierLogistics: undefined }
      : result,
  );
}

function restorePartialLogistics(
  enriched: SupplierSearchResult[],
  discovered: SupplierSearchResult[],
) {
  const originalByUrl = new Map(discovered.map((result) => [result.productUrl, result]));
  return enriched.map((result) => ({
    ...result,
    supplierLogistics: result.supplierLogistics ??
      originalByUrl.get(result.productUrl)?.supplierLogistics,
  }));
}

function uniqueQueries(queries: string[]) {
  return [...new Set(
    queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean),
  )].slice(0, 5);
}

function build1688SearchInput(input: SearchRequest): SearchRequest {
  const suppliedChineseQueries = input.chinese1688QueryVariants ?? [];
  const sourceQueries = input.queryVariants?.length
    ? input.queryVariants
    : [input.productQuery];
  const baseQueries = suppliedChineseQueries.length > 0
    ? suppliedChineseQueries
    : sourceQueries.map((query) => `${query} 1688 中国 批发 厂家 工厂 货源`);
  const queryVariants = uniqueQueries(
    baseQueries.map((query) => `${query} site:1688.com`),
  );

  return {
    ...input,
    productQuery: queryVariants[0] ?? `${input.productQuery} site:1688.com`,
    queryVariants: queryVariants.length > 0
      ? queryVariants
      : [`${input.productQuery} site:1688.com`],
  };
}

/**
 * Dedicated 1688 discovery and enrichment pass for TAJA Deep Search.
 *
 * Discovery uses OpenAI live web search with requirement-driven Chinese query
 * variants. A second bounded batch pass verifies missing commercial and
 * logistics fields against the exact direct URLs. Enrichment failure never
 * discards a valid discovery result and all automatic values remain
 * preliminary evidence.
 */
export function createOpenAI1688SearchSource(
  options: OpenAI1688SearchOptions = {},
): SupplierSearchSource {
  const {
    enrichmentMaxResults,
    enrichmentTimeoutMs,
    enricher: injectedEnricher,
    ...sharedOptions
  } = options;
  const baseSource = createOpenAIWebSearchSource({
    ...sharedOptions,
    maxResults: sharedOptions.maxResults ?? 10,
  });
  const enricher = injectedEnricher ?? createOpenAI1688Enricher({
    ...sharedOptions,
    maxResults: enrichmentMaxResults ?? 5,
    requestTimeoutMs: enrichmentTimeoutMs ?? Math.min(
      sharedOptions.requestTimeoutMs ?? 45_000,
      30_000,
    ),
  });

  return {
    name: "openai-1688-web-v2",
    implemented: baseSource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return baseSource.healthCheck ? baseSource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const outcome = outcomeParts(await baseSource.search(
        build1688SearchInput(input),
        signal,
      ));
      const discovered = outcome.results
        .filter((result) => is1688ProductUrl(result.productUrl))
        .map(normalize1688Result);

      if (discovered.length === 0) {
        return {
          results: [],
          reason: outcome.reason ?? "TAJA 1688 search returned no verified direct product pages.",
          ...(outcome.aiUsage?.length ? { aiUsage: outcome.aiUsage } : {}),
        };
      }

      let results = discovered;
      let enrichmentUsage: AiUsageReport[] = [];
      if (enricher.implemented) {
        try {
          const enriched = await enricher.enrich({
            results: prepare1688ResultsForEnrichment(discovered),
            quantity: input.quantity,
          }, signal);
          results = restorePartialLogistics(enriched.results, discovered)
            .map(normalize1688Result);
          enrichmentUsage = enriched.aiUsage ?? [];
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }

      const aiUsage = [...(outcome.aiUsage ?? []), ...enrichmentUsage];
      return {
        results,
        ...(aiUsage.length > 0 ? { aiUsage } : {}),
      };
    },
  };
}
