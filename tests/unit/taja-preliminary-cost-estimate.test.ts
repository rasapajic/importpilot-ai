import { describe, expect, it } from "vitest";

import { estimateTajaPreliminaryLandedCost } from "../../modules/product-search/domain/taja-preliminary-cost-estimate";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function offer(
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title: "65W USB-C phone charger",
    supplierName: "Shenzhen Charger Factory",
    supplierCountry: "CN",
    price: 5,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.example/charger",
    imageUrl: null,
    source: "TAJA web",
    ...overrides,
  };
}

describe("TAJA preliminary landed-cost estimate", () => {
  it("returns a transparent EUR range without claiming confirmed landed cost", () => {
    const estimate = estimateTajaPreliminaryLandedCost({
      result: offer(),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 30,
    });

    expect(estimate).not.toBeNull();
    expect(estimate).toMatchObject({
      currency: "EUR",
      transportMode: "RAIL",
      vatRatePercent: 20,
      customsDutyRateScenarios: [0, 5, 10],
    });
    expect(estimate!.lowPerUnitEur).toBeLessThan(estimate!.basePerUnitEur);
    expect(estimate!.basePerUnitEur).toBeLessThan(estimate!.highPerUnitEur);
    expect(estimate!.requiredSellingPriceBaseEur).toBeGreaterThan(
      estimate!.basePerUnitEur,
    );
    expect(estimate!.warnings).toEqual(expect.arrayContaining([
      "CUSTOMS_CLASSIFICATION_REQUIRED",
      "TRANSPORT_ESTIMATE_NOT_QUOTE",
      "FX_REFERENCE_RATE",
      "ANTIDUMPING_NOT_INCLUDED",
    ]));
  });

  it("does not estimate unsupported destination, currency or delivery-inclusive Incoterm", () => {
    expect(estimateTajaPreliminaryLandedCost({
      result: offer(),
      quantity: 100,
      targetCountry: "FR",
      targetMarginPercent: 30,
    })).toBeNull();
    expect(estimateTajaPreliminaryLandedCost({
      result: offer({ currency: "JPY" }),
      quantity: 100,
      targetCountry: "DE",
      targetMarginPercent: 30,
    })).toBeNull();
    expect(estimateTajaPreliminaryLandedCost({
      result: offer({ incoterm: "DDP" }),
      quantity: 100,
      targetCountry: "RS",
      targetMarginPercent: 30,
    })).toBeNull();
  });

  it("does not reuse China-Europe heuristics for a known non-China supplier", () => {
    expect(estimateTajaPreliminaryLandedCost({
      result: offer({ supplierCountry: "IN" }),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 30,
    })).toBeNull();
  });

  it("does not silently assume China for an unknown direct manufacturer", () => {
    expect(estimateTajaPreliminaryLandedCost({
      result: offer({ supplierCountry: null }),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 30,
    })).toBeNull();
  });

  it("allows an explicit, warned China assumption for a China marketplace", () => {
    const estimate = estimateTajaPreliminaryLandedCost({
      result: offer({
        supplierCountry: null,
        productUrl: "https://www.alibaba.com/product-detail/charger_123456.html",
      }),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 30,
    });

    expect(estimate).not.toBeNull();
    expect(estimate!.warnings).toContain("SUPPLIER_ORIGIN_ASSUMED_CHINA");
    expect(estimate!.assumptions.join(" ")).toContain("China is assumed");
  });
});
