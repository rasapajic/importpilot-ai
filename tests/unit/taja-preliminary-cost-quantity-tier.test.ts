import { describe, expect, it } from "vitest";

import { estimateTajaPreliminaryLandedCost } from "../../modules/product-search/domain/taja-preliminary-cost-estimate";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function tieredOffer(): SupplierOfferSearchResult {
  return {
    title: "100W USB-C to USB-C Braided Charging Cable",
    supplierName: "Shenzhen Cable Supplier",
    supplierCountry: "CN",
    price: 1.2,
    currency: "EUR",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.en.made-in-china.com/product/cable.html",
    imageUrl: "https://example.com/cable.jpg",
    source: "made-in-china.com",
    marketplaceDetails: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [
        { price: 1.2, currency: "EUR", minQuantity: 100, maxQuantity: 499 },
        { price: 0.95, currency: "EUR", minQuantity: 500, maxQuantity: 999 },
        { price: 0.82, currency: "EUR", minQuantity: 1_000, maxQuantity: null },
      ],
      attributes: [],
      variants: [],
      packaging: null,
    },
  };
}

describe("TAJA quantity-tier landed-cost pricing", () => {
  it("uses the source-published tier for the requested quantity", () => {
    const at100 = estimateTajaPreliminaryLandedCost({
      result: tieredOffer(),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 0,
      fxSnapshot: null,
    });
    const at500 = estimateTajaPreliminaryLandedCost({
      result: tieredOffer(),
      quantity: 500,
      targetCountry: "AT",
      targetMarginPercent: 0,
      fxSnapshot: null,
    });
    const at1000 = estimateTajaPreliminaryLandedCost({
      result: tieredOffer(),
      quantity: 1_000,
      targetCountry: "AT",
      targetMarginPercent: 0,
      fxSnapshot: null,
    });

    expect(at100?.goodsCostEur).toBe(120);
    expect(at500?.goodsCostEur).toBe(475);
    expect(at1000?.goodsCostEur).toBe(820);
    expect(at500!.basePerUnitEur).toBeLessThan(at100!.basePerUnitEur);
    expect(at1000!.basePerUnitEur).toBeLessThan(at500!.basePerUnitEur);
  });
});
