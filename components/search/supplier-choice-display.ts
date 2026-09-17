import {
  selectSupplierOfferPriceTier,
} from "@/modules/product-search/domain/marketplace-product-details";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";

export type QuantityPriceSnapshot = {
  quantity: number;
  price: number | null;
  currency: string | null;
  confirmedByTier: boolean;
};

function uniquePositiveQuantities(values: Array<number | null | undefined>) {
  return [...new Set(
    values.filter((value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value > 0,
    ),
  )];
}

export function supplierOfferForQuantity(
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

export function quantityPriceSnapshots(
  result: SupplierOfferSearchResult,
  requestedQuantity: number | null | undefined,
) {
  const quantities = uniquePositiveQuantities([requestedQuantity, 500, 1_000]);
  return quantities.map((quantity): QuantityPriceSnapshot => {
    const tier = selectSupplierOfferPriceTier(result.marketplaceDetails, quantity);
    const tierCurrency = tier?.currency ?? result.currency;
    if (tier && tierCurrency) {
      return {
        quantity,
        price: tier.price,
        currency: tierCurrency,
        confirmedByTier: true,
      };
    }
    if (
      quantity === requestedQuantity &&
      result.price !== null &&
      result.currency !== null
    ) {
      return {
        quantity,
        price: result.price,
        currency: result.currency,
        confirmedByTier: false,
      };
    }
    return {
      quantity,
      price: null,
      currency: null,
      confirmedByTier: false,
    };
  });
}

function normalizedTitle(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ");
}

function titleLengths(title: string) {
  const values = new Map<string, string>();
  for (const match of title.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/gi)) {
    const raw = match[1]?.replace(",", ".");
    if (!raw) continue;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 20) continue;
    const display = `${raw} m`;
    values.set(display.toLowerCase(), display);
  }
  return [...values.values()];
}

export function supplierOfferVariantFacts(result: SupplierOfferSearchResult) {
  const groups = (result.marketplaceDetails?.variants ?? []).map((variant) => ({
    name: variant.name,
    values: variant.values,
  }));
  const hasLengthGroup = groups.some((group) => /\blength\b/i.test(group.name));
  const lengths = hasLengthGroup ? [] : titleLengths(result.title);
  if (lengths.length > 0) groups.unshift({ name: "Length", values: lengths });

  const title = normalizedTitle(result.title);
  const types: string[] = [];
  if (/\bmagnet(?:ic|ized|ised)?\b/.test(title)) types.push("Magnetic");
  if (/\b(?:extension|extender)\b|\bmale\s+(?:to|2)\s+female\b|\bfemale\s+(?:to|2)\s+male\b/.test(title)) {
    types.push("Extension");
  }
  if (/\bdata\b|\b(?:usb\s*)?3(?:\.\d)?\b|\b(?:10|20|40)\s*gbps\b/.test(title)) types.push("Data");
  if (/\bcharg(?:e|er|ing)\w*\b|\bpd(?:\d+(?:\.\d+)?)?\b|\bpower\s+delivery\b/.test(title)) {
    types.push("Charging");
  }

  return {
    groups: groups.slice(0, 4),
    types: [...new Set(types)],
  };
}
