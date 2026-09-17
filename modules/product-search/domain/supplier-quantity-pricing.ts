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
