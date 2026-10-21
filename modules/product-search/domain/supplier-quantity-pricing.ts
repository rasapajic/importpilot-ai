import { selectSupplierOfferPriceTier } from "./marketplace-product-details";
import type { SupplierOfferSearchResult } from "./search";

export type SupplierQuantityPriceBasis = "PRODUCT_PAGE_TIER" | "INFORMATIONAL";

/**
 * A product-page quantity tier is evidence from the listing. It is never a
 * supplier quotation for this specific order.
 */
export type SupplierQuantityPriceAssessment = {
  advertisedPrice: number | null;
  advertisedCurrency: string | null;
  quantityUnitPrice: number | null;
  quantityCurrency: string | null;
  basis: SupplierQuantityPriceBasis | "UNAVAILABLE";
  supplierOrderQuote: false;
  procurementCostConfirmed: boolean;
};

export type SupplierMoqKind = "STOCK" | "PRODUCTION" | "VARIANT";
export type SupplierMoqScope = "ORDER" | "COLOR" | "VARIANT" | "MODEL";

export type SupplierMoqCondition = {
  kind: SupplierMoqKind;
  quantity: number;
  scope: SupplierMoqScope;
};

export type SupplierOrderTermsAssessment = {
  stockMoq: number | null;
  productionMoq: number | null;
  variantMoq: number | null;
  conditionsReliable: boolean;
  mixingStatus: "CONFIRMED" | "UNCONFIRMED";
  orderQuantityConfirmed: boolean | null;
};

function positivePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Uses a published quantity tier only when that tier covers the requested
 * quantity. The advertised unit price stays available as information, but it
 * is not treated as the price of this quantity and cannot confirm procurement
 * cost. A matching tier is still only a product-page price, not a supplier
 * quotation for the order.
 */
export function assessSupplierOfferQuantityPrice(
  result: SupplierOfferSearchResult,
  quantity: number | null | undefined,
): SupplierQuantityPriceAssessment {
  const tier = selectSupplierOfferPriceTier(result.marketplaceDetails, quantity);
  const tierCurrency = tier?.currency ?? result.currency;
  const confirmed = Boolean(
    tier &&
    positivePrice(tier.price) &&
    tierCurrency &&
    tierCurrency.trim().length > 0,
  );
  const advertised = positivePrice(result.price) &&
    result.currency !== null &&
    result.currency.trim().length > 0;

  return {
    advertisedPrice: advertised ? result.price : null,
    advertisedCurrency: advertised ? result.currency : null,
    quantityUnitPrice: confirmed ? tier!.price : null,
    quantityCurrency: confirmed ? tierCurrency : null,
    basis: confirmed ? "PRODUCT_PAGE_TIER" : advertised ? "INFORMATIONAL" : "UNAVAILABLE",
    supplierOrderQuote: false,
    procurementCostConfirmed: confirmed,
  };
}

/**
 * Applies only a source-published price tier that explicitly covers the
 * requested quantity. Without that tier the advertised price is left in place
 * for display, and callers must not treat it as the confirmed quantity price.
 */
export function applySupplierOfferQuantityPrice(
  result: SupplierOfferSearchResult,
  quantity: number | null | undefined,
): SupplierOfferSearchResult {
  const pricing = assessSupplierOfferQuantityPrice(result, quantity);
  if (!pricing.procurementCostConfirmed || pricing.quantityUnitPrice === null || !pricing.quantityCurrency) {
    return result;
  }
  return {
    ...result,
    price: pricing.quantityUnitPrice,
    currency: pricing.quantityCurrency,
  };
}

function distinctPositiveQuantities(conditions: SupplierMoqCondition[]) {
  return [...new Set(
    conditions
      .map((condition) => condition.quantity)
      .filter((quantity) => Number.isInteger(quantity) && quantity > 0),
  )];
}

/**
 * Keeps stock, production and per-variant minimums separate when each kind is
 * internally consistent. Conflicting numbers for the same kind, or no explicit
 * statement that variants may be mixed, stay unconfirmed.
 */
export function assessSupplierOrderTerms(input: {
  requestedQuantity: number;
  variantMixRequested: boolean;
  conditions: SupplierMoqCondition[];
  mixingExplicitlyConfirmed: boolean | null;
}): SupplierOrderTermsAssessment {
  const reliableConditions = input.conditions.filter((condition) =>
    Number.isInteger(condition.quantity) && condition.quantity > 0,
  );
  const byKind = {
    STOCK: reliableConditions.filter((condition) => condition.kind === "STOCK"),
    PRODUCTION: reliableConditions.filter((condition) => condition.kind === "PRODUCTION"),
    VARIANT: reliableConditions.filter((condition) => condition.kind === "VARIANT"),
  };
  const stockQuantities = distinctPositiveQuantities(byKind.STOCK);
  const productionQuantities = distinctPositiveQuantities(byKind.PRODUCTION);
  const variantQuantities = distinctPositiveQuantities(byKind.VARIANT);
  const contradictory = stockQuantities.length > 1 ||
    productionQuantities.length > 1 ||
    variantQuantities.length > 1;
  const anyReliable = stockQuantities.length === 1 ||
    productionQuantities.length === 1 ||
    variantQuantities.length === 1;
  const conditionsReliable = !contradictory && anyReliable;
  const mixingStatus = input.variantMixRequested &&
    input.mixingExplicitlyConfirmed === true &&
    conditionsReliable
    ? "CONFIRMED" as const
    : "UNCONFIRMED" as const;
  const stockMoq = !contradictory && stockQuantities.length === 1 ? stockQuantities[0]! : null;
  const productionMoq = !contradictory && productionQuantities.length === 1
    ? productionQuantities[0]!
    : null;
  const variantMoq = !contradictory && variantQuantities.length === 1
    ? variantQuantities[0]!
    : null;
  const applicableMinimums = [stockMoq, productionMoq, variantMoq]
    .filter((quantity): quantity is number => quantity !== null);
  const orderQuantityConfirmed = input.variantMixRequested ||
    !conditionsReliable ||
    applicableMinimums.length !== 1 ||
    !Number.isInteger(input.requestedQuantity) ||
    input.requestedQuantity <= 0
    ? null
    : input.requestedQuantity >= applicableMinimums[0]!;

  return {
    stockMoq,
    productionMoq,
    variantMoq,
    conditionsReliable,
    mixingStatus,
    orderQuantityConfirmed,
  };
}


/**
 * Returns true when the offer has a positive price that can be shown in the
 * comparison list. An advertised price without a quantity tier remains
 * visible, but it does not confirm procurement cost for the requested quantity.
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
