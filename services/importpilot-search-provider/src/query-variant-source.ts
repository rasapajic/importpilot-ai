import type {
  AiUsageReport,
  SearchRequest,
  SupplierSearchResult,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";
import type {
  SupplierSearchOutcome,
  SupplierSearchSource,
} from "./provider.js";
import { rankRelevantSupplierResults } from "./relevance.js";

type QueryVariantSourceOptions = {
  maxVariants?: number;
  maxResults?: number;
  logger?: DevelopmentLogger;
};

function positiveInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value!)));
}

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, reason: undefined, aiUsage: undefined }
    : outcome;
}

function canonicalProductUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (/^(?:spm|utm_|src|source|ref|from|scm|pvid)/i.test(parameter)) {
        url.searchParams.delete(parameter);
      }
    }
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizedFingerprintPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resultFingerprint(result: SupplierSearchResult) {
  return [
    normalizedFingerprintPart(result.supplierName),
    normalizedFingerprintPart(result.title),
  ].join("::");
}

function uniqueQueries(input: SearchRequest, maxVariants: number) {
  return [...new Set(
    [input.productQuery, ...(input.queryVariants ?? [])]
      .map((query) => query.replace(/\s+/g, " ").trim())
      .filter((query) => query.length >= 2),
  )].slice(0, maxVariants);
}

/**
 * Expands non-AI marketplace adapters across every prepared requirement-driven
 * query variant. A direct source is not allowed to stop the whole search merely
 * because its first, most specific query returned generic related products.
 * Results from every bounded variant are deduplicated and ranked against the
 * most specific query before returning to the multi-source aggregator.
 */
export function createQueryVariantExpandingSource(
  source: SupplierSearchSource,
  options: QueryVariantSourceOptions = {},
): SupplierSearchSource {
  const maxVariants = positiveInteger(options.maxVariants, 5, 5);
  const maxResults = positiveInteger(options.maxResults, 15, 100);
  const logger = options.logger ?? createDevelopmentLogger();

  return {
    name: `${source.name}-query-variants`,
    implemented: source.implemented,
    trustedRelevance: source.trustedRelevance,

    async healthCheck(signal) {
      return source.healthCheck ? source.healthCheck(signal) : true;
    },

    async search(input, signal) {
      const queries = uniqueQueries(input, maxVariants);
      const seenUrls = new Set<string>();
      const seenFingerprints = new Set<string>();
      const collected: SupplierSearchResult[] = [];
      const aiUsage: AiUsageReport[] = [];
      let lastReason: string | undefined;

      for (const [variantIndex, query] of queries.entries()) {
        try {
          const outcome = outcomeParts(await source.search({
            ...input,
            productQuery: query,
            queryVariants: [query],
            chinese1688QueryVariants: [],
          }, signal));
          lastReason = outcome.reason ?? lastReason;
          if (outcome.aiUsage?.length) aiUsage.push(...outcome.aiUsage);

          let accepted = 0;
          for (const result of outcome.results) {
            const urlKey = canonicalProductUrl(result.productUrl);
            const fingerprint = resultFingerprint(result);
            if (seenUrls.has(urlKey) || seenFingerprints.has(fingerprint)) continue;
            seenUrls.add(urlKey);
            seenFingerprints.add(fingerprint);
            collected.push(result);
            accepted += 1;
          }

          logger("direct_source_query_variant", {
            provider_name: source.name,
            variant_index: variantIndex,
            query_variant: query,
            parsed_results: outcome.results.length,
            new_results: accepted,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          lastReason = error instanceof Error
            ? error.message
            : "Direct supplier source query variant failed.";
          logger("direct_source_query_variant_failed", {
            provider_name: source.name,
            variant_index: variantIndex,
            query_variant: query,
            error_name: error instanceof Error ? error.name : "UnknownError",
            error_message: lastReason,
          });
        }
      }

      const mostSpecificQuery = queries[0] ?? input.productQuery;
      const ranked = rankRelevantSupplierResults(
        mostSpecificQuery,
        collected,
        maxResults,
      );
      const results = ranked.length > 0
        ? ranked
        : collected.slice(0, maxResults);

      logger("direct_source_query_variants_complete", {
        provider_name: source.name,
        attempted_variants: queries.length,
        collected_results: collected.length,
        returned_results: results.length,
      });

      return results.length > 0
        ? {
            results,
            ...(aiUsage.length > 0 ? { aiUsage } : {}),
          }
        : {
            results: [],
            reason: lastReason ?? `${source.name} returned no usable supplier offers.`,
            ...(aiUsage.length > 0 ? { aiUsage } : {}),
          };
    },
  };
}
