import {
  aiUsageReportsSchema,
  supplierSearchResultsSchema,
  type AiUsageReport,
  type SearchRequest,
  type SupplierSearchResult,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";
import { rankRelevantSupplierResults } from "./relevance.js";

export type SupplierSearchOutcome =
  | SupplierSearchResult[]
  | {
      results: SupplierSearchResult[];
      reason?: string;
      aiUsage?: AiUsageReport[];
    };

export const FALLBACK_UNAVAILABLE_REASON =
  "Automatic supplier search is currently unavailable. Import from a link or add an offer manually.";

export interface SupplierSearchSource {
  readonly name: string;
  readonly implemented: boolean;
  /**
   * Sources that already perform semantic product matching can bypass the
   * English lexical filter. This is required for TAJA searches started in
   * Serbian or German while supplier titles are usually English.
   */
  readonly trustedRelevance?: boolean;
  search(
    input: SearchRequest,
    signal: AbortSignal,
  ): Promise<SupplierSearchOutcome>;
  healthCheck?(signal: AbortSignal): Promise<boolean>;
}

export const unconfiguredSupplierSearchSource: SupplierSearchSource = {
  name: "unconfigured",
  implemented: false,
  async search() {
    return [];
  },
  async healthCheck() {
    return true;
  },
};

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome)
    ? { results: outcome, reason: undefined, aiUsage: undefined }
    : outcome;
}

function sanitizeProviderErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 500);
}

function usageLogDetails(events: AiUsageReport[]) {
  return events.length > 0 ? { ai_usage_events: events.length } : {};
}

function normalizedFingerprintPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function resultFingerprint(result: SupplierSearchResult) {
  return [
    normalizedFingerprintPart(result.supplierName),
    normalizedFingerprintPart(result.title),
  ].join("::");
}

type AggregatingSourceOptions = {
  maxResults?: number;
  maxResultsPerSource?: number;
};

type SourceAttempt = {
  source: SupplierSearchSource;
  parsedResultCount: number;
  relevantResults: SupplierSearchResult[];
  aiUsage: AiUsageReport[];
  reason?: string;
};

function mergeSourceResultsRoundRobin(attempts: SourceAttempt[], maxResults: number) {
  const queues = attempts.map((attempt) => [...attempt.relevantResults]);
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();
  const merged: SupplierSearchResult[] = [];

  while (merged.length < maxResults && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const result = queue.shift();
      if (!result) continue;

      const urlKey = canonicalProductUrl(result.productUrl);
      const fingerprint = resultFingerprint(result);
      if (seenUrls.has(urlKey) || seenFingerprints.has(fingerprint)) continue;

      seenUrls.add(urlKey);
      seenFingerprints.add(fingerprint);
      merged.push(result);
      if (merged.length >= maxResults) break;
    }
  }

  return merged;
}

/**
 * TAJA Deep Search phase 1 collector.
 *
 * Unlike the legacy fallback chain, this source executes every configured
 * supplier source, keeps relevant candidates from each one, removes duplicate
 * listings and merges the remaining candidates in round-robin order so that
 * one marketplace cannot crowd out all other sources.
 */
export function createAggregatingSupplierSearchSource(
  sources: SupplierSearchSource[],
  options: AggregatingSourceOptions = {},
  logger: DevelopmentLogger = createDevelopmentLogger(),
): SupplierSearchSource {
  const maxResults = Math.max(1, Math.min(100, Math.trunc(options.maxResults ?? 30)));
  const maxResultsPerSource = Math.max(
    1,
    Math.min(maxResults, Math.trunc(options.maxResultsPerSource ?? 15)),
  );

  return {
    name: `aggregate(${sources.map((source) => source.name).join(", ")})`,
    implemented: sources.some((source) => source.implemented),

    async healthCheck(signal) {
      const implementedSources = sources.filter((source) => source.implemented);
      if (implementedSources.length === 0) return false;
      const checks = await Promise.all(
        implementedSources.map((source) =>
          source.healthCheck ? source.healthCheck(signal).catch(() => false) : true,
        ),
      );
      return checks.some(Boolean);
    },

    async search(input, signal) {
      const implementedSources = sources.filter((source) => source.implemented);
      const attempts = await Promise.all(
        implementedSources.map(async (source): Promise<SourceAttempt> => {
          try {
            const outcome = outcomeParts(await source.search(input, signal));
            const relevantResults = source.trustedRelevance
              ? outcome.results.slice(0, maxResultsPerSource)
              : rankRelevantSupplierResults(
                  input.productQuery,
                  outcome.results,
                  maxResultsPerSource,
                );

            logger("provider_attempt", {
              provider_name: source.name,
              parsed_results: outcome.results.length,
              fallback_used: false,
              aggregation_used: true,
            });
            logger("provider_relevance_filter", {
              provider_name: source.name,
              parsed_results: outcome.results.length,
              relevant_results: relevantResults.length,
              semantic_relevance_trusted: Boolean(source.trustedRelevance),
            });

            return {
              source,
              parsedResultCount: outcome.results.length,
              relevantResults,
              aiUsage: outcome.aiUsage ?? [],
              reason: outcome.reason,
            };
          } catch (error) {
            logger("provider_attempt_failed", {
              provider_name: source.name,
              error_name: error instanceof Error ? error.name : "UnknownError",
              error_message: sanitizeProviderErrorMessage(error),
            });
            if (signal.aborted) throw error;
            return {
              source,
              parsedResultCount: 0,
              relevantResults: [],
              aiUsage: [],
              reason: error instanceof Error ? error.message : "Unknown provider error.",
            };
          }
        }),
      );

      const aiUsage = attempts.flatMap((attempt) => attempt.aiUsage);
      const results = mergeSourceResultsRoundRobin(attempts, maxResults);
      const candidateCount = attempts.reduce(
        (total, attempt) => total + attempt.relevantResults.length,
        0,
      );

      logger("provider_aggregation_complete", {
        configured_sources: implementedSources.length,
        successful_sources: attempts.filter((attempt) => attempt.relevantResults.length > 0).length,
        parsed_results: attempts.reduce((total, attempt) => total + attempt.parsedResultCount, 0),
        relevant_candidates: candidateCount,
        duplicate_results_removed: Math.max(0, candidateCount - results.length),
        final_result_count: results.length,
        source_result_counts: Object.fromEntries(
          attempts.map((attempt) => [attempt.source.name, attempt.relevantResults.length]),
        ),
        ...usageLogDetails(aiUsage),
      });

      if (results.length > 0) {
        logger("provider_final_result", {
          final_provider_used: "multi-source-aggregation",
          final_result_count: results.length,
          final_reason: null,
          ...usageLogDetails(aiUsage),
        });
        return {
          results,
          ...(aiUsage.length > 0 ? { aiUsage } : {}),
        };
      }

      logger("provider_final_result", {
        final_provider_used: null,
        final_result_count: 0,
        final_reason: FALLBACK_UNAVAILABLE_REASON,
        ...usageLogDetails(aiUsage),
      });
      return {
        results: [],
        reason: FALLBACK_UNAVAILABLE_REASON,
        ...(aiUsage.length > 0 ? { aiUsage } : {}),
      };
    },
  };
}

export function createFallbackSupplierSearchSource(
  sources: SupplierSearchSource[],
  logger: DevelopmentLogger = createDevelopmentLogger(),
): SupplierSearchSource {
  return {
    name: sources.map((source) => source.name).join(" -> "),
    implemented: sources.some((source) => source.implemented),

    async healthCheck(signal) {
      for (const source of sources) {
        if (!source.implemented) continue;
        if (!source.healthCheck || await source.healthCheck(signal).catch(() => false)) return true;
      }
      return false;
    },

    async search(input, signal) {
      const accumulatedAiUsage: AiUsageReport[] = [];

      for (const [index, source] of sources.entries()) {
        if (!source.implemented) continue;
        try {
          const outcome = outcomeParts(await source.search(input, signal));
          if (outcome.aiUsage?.length) accumulatedAiUsage.push(...outcome.aiUsage);
          const relevantResults = source.trustedRelevance
            ? outcome.results.slice(0, 10)
            : rankRelevantSupplierResults(
                input.productQuery,
                outcome.results,
                5,
              );
          logger("provider_attempt", {
            provider_name: source.name,
            parsed_results: outcome.results.length,
            fallback_used: index > 0,
          });
          logger("provider_relevance_filter", {
            provider_name: source.name,
            parsed_results: outcome.results.length,
            relevant_results: relevantResults.length,
            semantic_relevance_trusted: Boolean(source.trustedRelevance),
          });
          if (relevantResults.length > 0) {
            logger("provider_final_result", {
              final_provider_used: source.name,
              final_result_count: relevantResults.length,
              final_reason: null,
              ...usageLogDetails(accumulatedAiUsage),
            });
            return {
              results: relevantResults,
              ...(accumulatedAiUsage.length > 0 ? { aiUsage: accumulatedAiUsage } : {}),
            };
          }
        } catch (error) {
          logger("provider_attempt_failed", {
            provider_name: source.name,
            error_name: error instanceof Error ? error.name : "UnknownError",
            error_message: sanitizeProviderErrorMessage(error),
          });
          if (signal.aborted) throw error;
          logger("provider_attempt", {
            provider_name: source.name,
            parsed_results: 0,
            fallback_used: index > 0,
          });
          logger("provider_relevance_filter", {
            provider_name: source.name,
            parsed_results: 0,
            relevant_results: 0,
            semantic_relevance_trusted: Boolean(source.trustedRelevance),
          });
        }
      }
      logger("provider_final_result", {
        final_provider_used: null,
        final_result_count: 0,
        final_reason: FALLBACK_UNAVAILABLE_REASON,
        ...usageLogDetails(accumulatedAiUsage),
      });
      return {
        results: [],
        reason: FALLBACK_UNAVAILABLE_REASON,
        ...(accumulatedAiUsage.length > 0 ? { aiUsage: accumulatedAiUsage } : {}),
      };
    },
  };
}

export async function runValidatedSearch(
  source: SupplierSearchSource,
  input: SearchRequest,
  signal: AbortSignal,
) {
  const outcome = await source.search(input, signal);
  const { results, reason, aiUsage } = outcomeParts(outcome);
  return {
    results: supplierSearchResultsSchema.parse(results),
    reason,
    ...(aiUsage?.length ? { aiUsage: aiUsageReportsSchema.parse(aiUsage) } : {}),
  };
}
