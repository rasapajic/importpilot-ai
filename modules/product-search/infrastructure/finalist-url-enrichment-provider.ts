import type {
  SupplierOfferUrlImportProvider,
  SupplierOfferUrlPreview,
} from "../domain/search";

export const TAJA_FINALIST_EXACT_PAGE_LIMIT = 3;
export const TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS = 3_500;

export class TajaFinalistEnrichmentLimitError extends Error {
  constructor() {
    super("Exact-page enrichment is limited to TAJA's top finalists.");
    this.name = "TajaFinalistEnrichmentLimitError";
  }
}

/**
 * The deep-search provider already returns the full result set. Exact product
 * page parsing is a second, slower verification phase, so it must never block
 * the browser while ten or more offers are fetched one by one. Only the first
 * ranked finalists are allowed through; later cards remain usable with their
 * discovery evidence and can still be verified when the user opens or imports
 * them explicitly.
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
