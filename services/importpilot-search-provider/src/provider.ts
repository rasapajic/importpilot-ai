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
