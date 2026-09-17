import type {
  SupplierOfferUrlImportProvider,
  SupplierOfferUrlPreview,
} from "../domain/search";

export const TAJA_FINALIST_EXACT_PAGE_LIMIT = 10;
export const TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS = 3_500;

export class TajaFinalistEnrichmentLimitError extends Error {
  constructor() {
    super("Exact-page enrichment is limited to TAJA's top finalists.");
    this.name = "TajaFinalistEnrichmentLimitError";
  }
}

/**
 * The deep-search provider already returns the full result set. Exact product
 * page parsing is a second, slower verification phase. The auto-enrichment
 * layer runs a bounded supported-candidate queue concurrently, so allowing up
 * to ten supported finalists gives the user more source-grounded images,
 * variants, quantity prices and commercial facts without serially blocking the
 * browser on unsupported pages.
 */
export function createFinalistUrlEnrichmentProvider(
  provider: SupplierOfferUrlImportProvider,
  limit = TAJA_FINALIST_EXACT_PAGE_LIMIT,
): SupplierOfferUrlImportProvider {
  let started = 0;

  return {
    previewSupplierOfferUrl(productUrl: string): Promise<SupplierOfferUrlPreview> {
      if (started >= limit) {
        return Promise.reject(new TajaFinalistEnrichmentLimitError());
      }
      started += 1;
      return provider.previewSupplierOfferUrl(productUrl);
    },
  };
}
