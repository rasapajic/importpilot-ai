import { selectSupplierOfferPriceTier } from "./marketplace-product-details";
import type { SupplierOfferSearchResult } from "./search";

/**
 * Applies only a source-published price tier that explicitly covers the
 * requested quantity. If the product page does not publish a matching tier,
 * the original offer price remains unchanged rather than being interpolated.
 */
export function applySupplierOfferQuantityPrice(
  result: SupplierOfferSearchResult,
  quantity: number | null | undefined,
): SupplierOfferSearchResult {
  const tier = selectSupplierOfferPriceTier(result.marketplaceDetails, quantity);
  if (!tier) return result;
  const currency = tier.currency ?? result.currency;
  if (!currency) return result;
  return {
    ...result,
    price: tier.price,
    currency,
  };
}


/**
 * Returns true only when the offer has a positive, displayable commercial
 * price for the requested quantity. Price-less discovery hits are not useful
 * enough for the 1.0 comparison list.
 */
export function hasUsableSupplierOfferPrice(
  result: SupplierOfferSearchResult,
  quantity: number | null | undefined,
) {
  const effective = applySupplierOfferQuantityPrice(result, quantity);
  return (
    effective.price !== null &&
    Number.isFinite(effective.price) &&
    effective.price > 0 &&
    effective.currency !== null &&
    effective.currency.trim().length > 0
  );
}
