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

const MIRROR_HOSTS = new Set([
  "1688wholesale.com",
  "www.1688wholesale.com",
  "buy2you.com",
  "www.buy2you.com",
  "darabuying.com",
  "www.darabuying.com",
]);

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

export function mirror1688OfferId(productUrl: string) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" || !MIRROR_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    const match = url.pathname.toLowerCase().replace(/\/+$/, "").match(
      /\/(?:1688|1688wholesale)\/china_alibaba_item\/(\d+)\.html?$/,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function is1688MirrorProductUrl(productUrl: string) {
  return mirror1688OfferId(productUrl) !== null;
}

export function canonical1688UrlFromMirror(productUrl: string) {
  const offerId = mirror1688OfferId(productUrl);
  return offerId ? `https://detail.1688.com/offer/${offerId}.html` : null;
}

function normalize1688Result(
  result: SupplierSearchResult,
  source = "TAJA 1688",
): SupplierSearchResult {
  return {
    ...result,
    source,
  };
}

function normalizeMirrorResult(result: SupplierSearchResult) {
  const productUrl = canonical1688UrlFromMirror(result.productUrl);
  if (!productUrl) return null;
  return {
    ...result,
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "TAJA 1688 · indexed mirror",
    supplierLogistics: undefined,
  } satisfies SupplierSearchResult;
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

function base1688Queries(input: SearchRequest) {
  const suppliedChineseQueries = input.chinese1688QueryVariants ?? [];
  const sourceQueries = input.queryVariants?.length
    ? input.queryVariants
    : [input.productQuery];
  return suppliedChineseQueries.length > 0
    ? suppliedChineseQueries
    : sourceQueries.map((query) => `${query} 1688 中国 批发 厂家 工厂 货源`);
}

function build1688SearchInput(input: SearchRequest): SearchRequest {
  const baseQueries = base1688Queries(input);
  const detailQueries = baseQueries.map(
    (query) => `${query} site:detail.1688.com inurl:offer`,
  );
  const broadFallback = baseQueries[0]
    ? `${baseQueries[0]} site:1688.com`
    : null;
  const mobileFallback = baseQueries[0]
    ? `${baseQueries[0]} site:m.1688.com inurl:offer`
    : null;
  const queryVariants = uniqueQueries([
    ...detailQueries,
    ...(broadFallback ? [broadFallback] : []),
    ...(mobileFallback ? [mobileFallback] : []),
  ]);
  const fallback = `${input.productQuery} site:detail.1688.com inurl:offer`;

  return {
    ...input,
    productQuery: queryVariants[0] ?? fallback,
    queryVariants: queryVariants.length > 0 ? queryVariants : [fallback],
  };
}

function build1688MirrorSearchInput(input: SearchRequest): SearchRequest {
  const base = base1688Queries(input)[0] ?? input.productQuery;
  const queryVariants = uniqueQueries([
    `${base} site:1688wholesale.com china_alibaba_item`,
    `${base} site:buy2you.com 1688wholesale china_alibaba_item`,
    `${base} site:darabuying.com 1688wholesale china_alibaba_item`,
  ]);
  return {
    ...input,
    productQuery: queryVariants[0] ?? base,
    queryVariants,
  };
}

/**
 * Dedicated 1688 discovery and enrichment pass for TAJA Deep Search.
 *
 * The primary pass remains strict 1688-only discovery. Public search indexes
 * often do not expose detail.1688.com directly even when they index an agent
 * mirror that embeds the original numeric 1688 item identity. Therefore, only
 * after the strict pass returns zero, one bounded mirror-discovery pass searches
 * three allowlisted 1688 agent mirrors whose URL path itself contains the source
 * 1688 item id. The mirror URL is never returned to the client: it is converted
 * mechanically to detail.1688.com/offer/<id>.html. Mirror commercial values are
 * discarded before exact-URL enrichment, so converted USD prices or agent terms
 * can never masquerade as native 1688 evidence.
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
  const directSource = createOpenAIWebSearchSource({
    ...sharedOptions,
    maxResults: sharedOptions.maxResults ?? 10,
    searchProfile: "1688_only",
    resultUrlPolicy: is1688ProductUrl,
  });
  const mirrorSource = createOpenAIWebSearchSource({
    ...sharedOptions,
    maxResults: Math.min(sharedOptions.maxResults ?? 5, 5),
    searchProfile: "general",
    resultUrlPolicy: is1688MirrorProductUrl,
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
    implemented: directSource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return directSource.healthCheck ? directSource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const direct = outcomeParts(await directSource.search(
        build1688SearchInput(input),
        signal,
      ));
      let discovered = direct.results
        .filter((result) => is1688ProductUrl(result.productUrl))
        .map((result) => normalize1688Result(result));
      let discoveryUsage: AiUsageReport[] = [...(direct.aiUsage ?? [])];
      let discoveryReason = direct.reason;

      if (discovered.length === 0) {
        const mirror = outcomeParts(await mirrorSource.search(
          build1688MirrorSearchInput(input),
          signal,
        ));
        const seen = new Set<string>();
        discovered = mirror.results
          .map(normalizeMirrorResult)
          .filter((result): result is SupplierSearchResult => Boolean(result))
          .filter((result) => {
            if (seen.has(result.productUrl)) return false;
            seen.add(result.productUrl);
            return true;
          });
        discoveryUsage = [...discoveryUsage, ...(mirror.aiUsage ?? [])];
        discoveryReason = mirror.reason ?? discoveryReason;
      }

      if (discovered.length === 0) {
        return {
          results: [],
          reason: discoveryReason ?? "TAJA 1688 search returned no verified direct or indexed-mirror product pages.",
          ...(discoveryUsage.length ? { aiUsage: discoveryUsage } : {}),
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
          results = restorePartialLogistics(enriched.results, discovered);
          enrichmentUsage = enriched.aiUsage ?? [];
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }

      const aiUsage = [...discoveryUsage, ...enrichmentUsage];
      return {
        results,
        ...(aiUsage.length > 0 ? { aiUsage } : {}),
      };
    },
  };
}
