import { describe, expect, it } from "vitest";

import {
  assessAdvertisedPriceTieBreak,
  orderByOptionalAdvertisedTieBreak,
} from "../../modules/product-search/domain/advertised-price-tie-break";
import { rankPreliminarySupplierOffers } from "../../modules/product-search/domain/preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const glasses = [
  { id: "zlin", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1.2, listedMoq: 12, confirmedPurchasePrice: false },
  { id: "wzouyuan", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false },
  { id: "readsun", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1, listedMoq: 200, confirmedPurchasePrice: false },
];

describe("advertised price as an optional tie-break", () => {
  it("keeps the saved glasses order free of unconfirmed advertised prices", () => {
    const assessment = assessAdvertisedPriceTieBreak(glasses);

    expect(assessment).toMatchObject({
      useAsTieBreak: false,
      informationalOnly: true,
      reason: "SPEC_UNCONFIRMED",
      lowestAdvertisedId: "wzouyuan",
    });
    expect(orderByOptionalAdvertisedTieBreak(glasses).map((offer) => offer.id)).toEqual([
      "zlin",
      "wzouyuan",
      "readsun",
    ]);
  });

  it("allows a weak advertised-price order only for the same confirmed specification, currency, and listing MOQ", () => {
    const comparable = glasses.map((offer) => ({
      ...offer,
      suitability: "COMPATIBLE" as const,
      listedMoq: 100,
    }));

    expect(assessAdvertisedPriceTieBreak(comparable).useAsTieBreak).toBe(true);
    expect(orderByOptionalAdvertisedTieBreak(comparable).map((offer) => offer.id)).toEqual([
      "wzouyuan",
      "readsun",
      "zlin",
    ]);
  });

  it("does not let a cheaper incompatible listing outrank a fixed-lens offer", () => {
    const mixed = [
      { id: "fixed", suitability: "COMPATIBLE" as const, currency: "USD", advertisedPrice: 1.2, listedMoq: 100, confirmedPurchasePrice: false },
      { id: "progressive", suitability: "DISQUALIFIED" as const, currency: "USD", advertisedPrice: 0.2, listedMoq: 100, confirmedPurchasePrice: false },
    ];

    expect(assessAdvertisedPriceTieBreak(mixed)).toMatchObject({
      useAsTieBreak: false,
      lowestAdvertisedId: "fixed",
    });
  });

  it("does not change the live preliminary ranker", () => {
    const request = "naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nije progresivno";
    const result = (name: string, price: number, moq: number): SupplierOfferSearchResult => ({
      title: `${name} reading glasses`,
      supplierName: name,
      supplierCountry: "CN",
      price,
      currency: "USD",
      minimumOrderQuantity: moq,
      incoterm: null,
      productUrl: `https://example.com/${name}`,
      imageUrl: null,
      source: "Made-in-China",
    });
    const ordered = rankPreliminarySupplierOffers([
      result("zlin", 1.2, 12),
      result("wzouyuan", 0.35, 100),
      result("readsun", 1, 200),
    ], { quantity: 1000, productQuery: request });

    expect(ordered.map((offer) => offer.supplierName)).toEqual(["zlin", "wzouyuan", "readsun"]);
  });
});
