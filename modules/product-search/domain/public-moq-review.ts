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
  preview: Pick<SupplierOfferUrlPreview, "moqConflictEvidence" | "moqUnverifiedFaqEvidence">,
): boolean {
  return Boolean(preview.moqConflictEvidence || preview.moqUnverifiedFaqEvidence);
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
  "price" | "minimumOrderQuantity" | "marketplaceDetails" | "supplierLogistics"
> {
  if (requiresSupplierMoqConfirmation(preview)) {
    return {
      price: null,
      minimumOrderQuantity: null,
      marketplaceDetails: null,
      supplierLogistics: null,
    };
  }

  return {
    price: preview.price,
    minimumOrderQuantity: preview.minimumOrderQuantity,
    marketplaceDetails: preview.details ?? null,
    supplierLogistics: marketplaceDetailsToSupplierLogistics(preview.details),
  };
}
