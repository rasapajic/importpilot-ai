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

export function is1688DiscoveryUrl(productUrl: string) {
  return is1688ProductUrl(productUrl) || is1688MirrorProductUrl(productUrl);
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

function normalizeDiscoveryResult(result: SupplierSearchResult) {
  return is1688ProductUrl(result.productUrl)
    ? normalize1688Result(result)
    : normalizeMirrorResult(result);
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
  const base = base1688Queries(input)[0] ?? input.productQuery;
  const queryVariants = uniqueQueries([
    `${base} site:detail.1688.com inurl:offer`,
    `${base} site:m.1688.com inurl:offer`,
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
 * Public search indexes often expose either the native detail.1688.com offer or
 * an agent mirror whose URL path embeds the original numeric 1688 item id. One
 * bounded web-search pass therefore targets both native 1688 offer hosts and
 * three allowlisted indexed mirrors. The URL policy accepts nothing else.
 * Mirror URLs are never returned to the client: the numeric identity is mapped
 * mechanically to detail.1688.com/offer/<id>.html, while all mirror commercial
 * values are discarded before exact-URL enrichment so converted prices or
 * agent terms cannot masquerade as native 1688 evidence.
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
  const discoverySource = createOpenAIWebSearchSource({
    ...sharedOptions,
    maxResults: sharedOptions.maxResults ?? 10,
    searchProfile: "general",
    resultUrlPolicy: is1688DiscoveryUrl,
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
    implemented: discoverySource.implemented,
    trustedRelevance: true,

    async healthCheck(signal) {
      return discoverySource.healthCheck ? discoverySource.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const discovery = outcomeParts(await discoverySource.search(
        build1688SearchInput(input),
        signal,
      ));
      const seen = new Set<string>();
      const discovered = discovery.results
        .map(normalizeDiscoveryResult)
        .filter((result): result is SupplierSearchResult => Boolean(result))
        .filter((result) => {
          if (seen.has(result.productUrl)) return false;
          seen.add(result.productUrl);
          return true;
        });
      const discoveryUsage: AiUsageReport[] = [...(discovery.aiUsage ?? [])];

      if (discovered.length === 0) {
        return {
          results: [],
          reason: discovery.reason ?? "TAJA 1688 search returned no verified direct or indexed-mirror product pages.",
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
