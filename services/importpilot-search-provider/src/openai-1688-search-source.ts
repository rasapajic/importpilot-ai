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
  offerUrlVerifier?: (productUrl: string, signal: AbortSignal) => Promise<boolean>;
};

const OFFER_VERIFICATION_TIMEOUT_MS = 5_000;

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

/**
 * Confirms that a native 1688 offer still resolves to that exact offer page.
 * Removed or region-blocked offers commonly redirect foreign visitors to the
 * marketplace homepage while retaining plausible product data in search
 * indexes. Such URLs must never be presented as openable supplier offers.
 */
export async function verifyOpenable1688OfferUrl(
  productUrl: string,
  signal: AbortSignal,
) {
  if (!is1688ProductUrl(productUrl)) return false;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), OFFER_VERIFICATION_TIMEOUT_MS);
  const abort = () => timeout.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(productUrl, {
      method: "GET",
      redirect: "follow",
      signal: timeout.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; JAKOV360/1.0; supplier-link-verification)",
      },
    });
    if (!response.ok || !is1688ProductUrl(response.url)) return false;
    const html = (await response.text()).slice(0, 300_000);
    return !/(?:window\.location|location\.replace|http-equiv=["']refresh)[\s\S]{0,300}https?:\/\/(?:www\.)?1688\.com(?:[\/"'])/i.test(html);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
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
    supplierName: "Supplier not confirmed",
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

function confirmedSupplierName(value: string) {
  return !/^(?:supplier\s+(?:not\s+confirmed|unknown)|unknown|unspecified)$/i.test(
    value.trim(),
  );
}

/**
 * A 1688 URL by itself is not a usable supplier offer. Indexed mirrors can
 * point to removed/login-only offers which redirect to the 1688 home page.
 * Do not show those placeholders unless exact-page enrichment (or a native
 * cited result) supplied both an identifiable seller and commercial evidence.
 */
export function hasUsable1688CommercialEvidence(result: SupplierSearchResult) {
  const hasPrice = result.price !== null && result.currency !== null;
  const hasOfferEvidence = hasPrice ||
    result.minimumOrderQuantity !== null ||
    result.imageUrl !== null ||
    hasUsableLogistics(result);
  return is1688ProductUrl(result.productUrl) &&
    confirmedSupplierName(result.supplierName) &&
    hasOfferEvidence;
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
  const primary = baseQueries[0] ?? input.productQuery;
  const secondary = baseQueries[1];
  const queryVariants = uniqueQueries([
    `${primary} site:detail.1688.com inurl:offer`,
    ...(secondary ? [`${secondary} site:detail.1688.com inurl:offer`] : []),
    `${primary} site:1688wholesale.com china_alibaba_item`,
    `${primary} site:buy2you.com 1688wholesale china_alibaba_item`,
    `${primary} site:darabuying.com 1688wholesale china_alibaba_item`,
  ]);
  return {
    ...input,
    productQuery: queryVariants[0] ?? primary,
    queryVariants,
  };
}

/**
 * Dedicated 1688 discovery and enrichment pass for TAJA Deep Search.
 *
 * Public search indexes often expose either the native detail.1688.com offer or
 * an agent mirror whose URL path embeds the original numeric 1688 item id. One
 * bounded web-search pass therefore preserves up to two precise Chinese native
 * offer queries and uses the remaining bounded slots for three allowlisted
 * indexed mirrors. The URL policy accepts nothing else. Mirror URLs are never
 * returned to the client: the numeric identity is mapped mechanically to
 * detail.1688.com/offer/<id>.html. Mirror supplier identity and all commercial
 * values are discarded before exact-URL enrichment so third-party labels,
 * converted prices or agent terms cannot masquerade as native 1688 evidence.
 */
export function createOpenAI1688SearchSource(
  options: OpenAI1688SearchOptions = {},
): SupplierSearchSource {
  const {
    enrichmentMaxResults,
    enrichmentTimeoutMs,
    enricher: injectedEnricher,
    offerUrlVerifier = verifyOpenable1688OfferUrl,
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

      const commerciallyUsable = results.filter(hasUsable1688CommercialEvidence);
      const verifiedOpenable = await Promise.all(
        commerciallyUsable.map(async (result) => ({
          result,
          openable: await offerUrlVerifier(result.productUrl, signal),
        })),
      );
      results = verifiedOpenable
        .filter((candidate) => candidate.openable)
        .map((candidate) => candidate.result);
      const aiUsage = [...discoveryUsage, ...enrichmentUsage];
      return {
        results,
        ...(results.length === 0
          ? { reason: "TAJA 1688 discarded unverified or unavailable product placeholders." }
          : {}),
        ...(aiUsage.length > 0 ? { aiUsage } : {}),
      };
    },
  };
}
