import type { SupplierOfferMarketplaceDetails } from "./marketplace-product-details";
import type { SupplierOfferSearchResult } from "./search";
import { canonicalSupplierProductUrl } from "./supplier-product-url";
import { presentSupplierOfferPrice } from "./supplier-quantity-pricing";

export type MissingAdvertisedPriceReason = "NO_PRODUCT_URL" | "NO_MATCHING_SEARCH_RESULT";

export type SavedOfferAdvertisedEvidence = {
  advertisedPrice: number | null;
  advertisedCurrency: string | null;
  advertisedPriceHigh: number | null;
  title: string | null;
  marketplaceDetails: SupplierOfferMarketplaceDetails | null;
  missingAdvertisedPriceReason: MissingAdvertisedPriceReason | null;
};

type PresentedAdvertisedPrice = {
  advertisedPrice: number;
  advertisedCurrency: string;
  advertisedPriceHigh: number | null;
  title: string;
  marketplaceDetails: SupplierOfferMarketplaceDetails | null;
};

function samePresentedPrice(left: PresentedAdvertisedPrice, right: PresentedAdvertisedPrice) {
  return left.advertisedPrice === right.advertisedPrice &&
    left.advertisedCurrency === right.advertisedCurrency &&
    left.advertisedPriceHigh === right.advertisedPriceHigh;
}

function presentedAdvertisedPrice(
  result: SupplierOfferSearchResult,
  quantity: number | null,
): PresentedAdvertisedPrice | null {
  const presentation = presentSupplierOfferPrice(result, quantity);
  if (
    presentation.advertisedPrice === null ||
    presentation.advertisedCurrency === null ||
    presentation.kind === "UNAVAILABLE"
  ) {
    return null;
  }
  return {
    advertisedPrice: presentation.advertisedPrice,
    advertisedCurrency: presentation.advertisedCurrency,
    advertisedPriceHigh: presentation.advertisedPriceHigh,
    title: result.title,
    marketplaceDetails: result.marketplaceDetails ?? null,
  };
}

export function matchesForProductUrl<T extends { productUrl: string }>(
  items: readonly T[],
  productUrl: string,
) {
  const key = canonicalSupplierProductUrl(productUrl);
  return items.filter((item) => canonicalSupplierProductUrl(item.productUrl) === key);
}

/**
 * Reads an advertised price for a saved offer without writing the offer.
 * Stored source metadata wins. Otherwise the price comes from the cached
 * search result with the same product address. A different title or supplier
 * name is not a match. Disagreement between cached snapshots is left unknown.
 */
export function bridgeSavedOfferSearchEvidence(input: {
  productUrl: string | null;
  storedAdvertisedPrice: number | null;
  storedAdvertisedCurrency: string | null;
  storedAdvertisedPriceHigh: number | null;
  storedTitle: string | null;
  storedMarketplaceDetails: SupplierOfferMarketplaceDetails | null;
  cachedResults: readonly SupplierOfferSearchResult[];
  quantity: number | null;
}): SavedOfferAdvertisedEvidence {
  if (input.storedAdvertisedPrice !== null && input.storedAdvertisedCurrency) {
    return {
      advertisedPrice: input.storedAdvertisedPrice,
      advertisedCurrency: input.storedAdvertisedCurrency,
      advertisedPriceHigh: input.storedAdvertisedPriceHigh,
      title: input.storedTitle,
      marketplaceDetails: input.storedMarketplaceDetails,
      missingAdvertisedPriceReason: null,
    };
  }
  if (!input.productUrl) {
    return {
      advertisedPrice: null,
      advertisedCurrency: null,
      advertisedPriceHigh: null,
      title: input.storedTitle,
      marketplaceDetails: input.storedMarketplaceDetails,
      missingAdvertisedPriceReason: "NO_PRODUCT_URL",
    };
  }

  const presented = matchesForProductUrl(input.cachedResults, input.productUrl)
    .flatMap((result) => {
      const price = presentedAdvertisedPrice(result, input.quantity);
      return price ? [price] : [];
    });
  const agreed = presented.every((price) => samePresentedPrice(price, presented[0]));
  if (presented.length === 0 || !agreed) {
    return {
      advertisedPrice: null,
      advertisedCurrency: null,
      advertisedPriceHigh: null,
      title: input.storedTitle,
      marketplaceDetails: input.storedMarketplaceDetails,
      missingAdvertisedPriceReason: "NO_MATCHING_SEARCH_RESULT",
    };
  }

  const price = presented[0];
  return {
    advertisedPrice: price.advertisedPrice,
    advertisedCurrency: price.advertisedCurrency,
    advertisedPriceHigh: price.advertisedPriceHigh,
    title: input.storedTitle ?? price.title,
    marketplaceDetails: input.storedMarketplaceDetails ?? price.marketplaceDetails,
    missingAdvertisedPriceReason: null,
  };
}

export function matchingSearchScore<T extends {
  productUrl: string;
  overallScore: number;
  confidenceScore: number;
}>(scores: readonly T[], productUrl: string | null): T | null {
  if (!productUrl) return null;
  const matches = matchesForProductUrl(scores, productUrl);
  if (matches.length === 0) return null;
  const same = matches.every((score) =>
    score.overallScore === matches[0].overallScore &&
    score.confidenceScore === matches[0].confidenceScore,
  );
  return same ? matches[0] : null;
}
