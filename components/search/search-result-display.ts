import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";

export function hasSupplierSearchResultCards(
  results: SupplierOfferSearchResult[] | null,
) {
  return Boolean(results?.length);
}
