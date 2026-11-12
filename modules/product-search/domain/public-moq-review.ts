import {
  marketplaceDetailsToSupplierLogistics,
} from "./marketplace-product-details";
import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlPreview,
} from "./search";

/**
 * A public seller FAQ is not a confirmed MOQ for the requested SKU.
 * Catalog/FAQ discrepancies are informational observations, not sale terms.
 */
export function requiresSupplierMoqConfirmation(
  preview: Pick<SupplierOfferUrlPreview, "moqConflictEvidence" | "moqAlignedFaqEvidence" | "moqUnverifiedFaqEvidence">,
): boolean {
  return Boolean(preview.moqConflictEvidence || preview.moqAlignedFaqEvidence || preview.moqUnverifiedFaqEvidence);
}

/**
 * Both URL-import forms MUST use this when creating an offer. It prevents
 * accidental client-side edits to a source-review preview from being turned
 * into quantities, tiers, logistics or prices used for landed-cost analysis.
 * The user may still import the product as an unpriced candidate.
 */
export function safeCommercialFieldsForPreview(
  preview: SupplierOfferUrlPreview,
): Pick<
  SupplierOfferSearchResult,
  "price" | "currency" | "minimumOrderQuantity" | "marketplaceDetails" | "supplierLogistics"
> {
  if (requiresSupplierMoqConfirmation(preview)) {
    return {
      price: null,
      currency: null,
      minimumOrderQuantity: null,
      marketplaceDetails: null,
      supplierLogistics: null,
    };
  }

  // Preview may display a public currency (USD) without a confirmed
  // numeric price. The supplier-offer API requires price AND currency as a
  // pair, so preserve neither when one is absent. This also covers ordinary
  // partial previews unrelated to the public MOQ review states.
  const hasPriceAndCurrency = preview.price !== null && preview.currency !== null;
  return {
    price: hasPriceAndCurrency ? preview.price : null,
    currency: hasPriceAndCurrency ? preview.currency : null,
    minimumOrderQuantity: preview.minimumOrderQuantity,
    marketplaceDetails: preview.details ?? null,
    supplierLogistics: marketplaceDetailsToSupplierLogistics(preview.details),
  };
}
