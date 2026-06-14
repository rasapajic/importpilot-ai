import {
  supplierOfferSearchInputSchema,
  type SupplierOfferSearchProvider,
} from "@/modules/product-search/domain/search";

export const unconfiguredSupplierOfferSearchProvider: SupplierOfferSearchProvider = {
  async searchSupplierOffers(input) {
    supplierOfferSearchInputSchema.parse(input);
    return [];
  },
};
