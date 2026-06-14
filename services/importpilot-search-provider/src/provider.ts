import {
  supplierSearchResultsSchema,
  type SearchRequest,
  type SupplierSearchResult,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";

export type SupplierSearchOutcome =
  | SupplierSearchResult[]
  | { results: SupplierSearchResult[]; reason?: string };

export const FALLBACK_UNAVAILABLE_REASON =
  "Automatic supplier search is currently unavailable. Import from a link or add an offer manually.";

export interface SupplierSearchSource {
  readonly name: string;
  readonly implemented: boolean;
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
    ? { results: outcome, reason: undefined }
    : outcome;
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
      for (const [index, source] of sources.entries()) {
        if (!source.implemented) continue;
        try {
          const outcome = outcomeParts(await source.search(input, signal));
          logger("provider_attempt", {
            provider_name: source.name,
            parsed_results: outcome.results.length,
            fallback_used: index > 0,
          });
          if (outcome.results.length > 0) {
            logger("provider_final_result", {
              final_provider_used: source.name,
              final_result_count: outcome.results.length,
              final_reason: null,
            });
            return { results: outcome.results };
          }
        } catch {
          logger("provider_attempt", {
            provider_name: source.name,
            parsed_results: 0,
            fallback_used: index > 0,
          });
        }
      }
      logger("provider_final_result", {
        final_provider_used: null,
        final_result_count: 0,
        final_reason: FALLBACK_UNAVAILABLE_REASON,
      });
      return {
        results: [],
        reason: FALLBACK_UNAVAILABLE_REASON,
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
  const { results, reason } = outcomeParts(outcome);
  return {
    results: supplierSearchResultsSchema.parse(results),
    reason,
  };
}
