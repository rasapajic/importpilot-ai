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
      version: "TAJA_PRELIMINARY_LANDED_COST_V3",
      currency: "EUR",
      transportMode: "RAIL",
      pricingBasisIncoterm: "FOB",
      pricingBasisAssumed: false,
      chinaDomesticTransportEur: 0,
      sourcingAgentFeeEur: 0,
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
    expect(estimate!.warnings).not.toContain("CHINA_DOMESTIC_TRANSPORT_ASSUMED");
    expect(estimate!.warnings).not.toContain("SOURCING_AGENT_FEE_ASSUMED");
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
    expect(estimate!.chinaDomesticTransportEur).toBe(0);
    expect(estimate!.sourcingAgentFeeEur).toBe(0);
  });

  it("includes transparent domestic China and agent planning costs for a 1688 EXW quote", () => {
    const estimate = estimateTajaPreliminaryLandedCost({
      result: offer({
        supplierCountry: null,
        price: 18.5,
        currency: "CNY",
        incoterm: null,
        productUrl: "https://detail.1688.com/offer/123456789.html",
        supplierLogistics: {
          grossWeightKg: null,
          netWeightKg: null,
          cartonLengthCm: null,
          cartonWidthCm: null,
          cartonHeightCm: null,
          piecesPerCarton: null,
          unitWeightKg: 0.7,
          unitVolumeCbm: 0.004,
          evidence: "PRODUCT_PAGE",
        },
      }),
      quantity: 100,
      targetCountry: "AT",
      targetMarginPercent: 30,
    });

    expect(estimate).not.toBeNull();
    expect(estimate).toMatchObject({
      confidence: "MEDIUM",
      pricingBasisIncoterm: "EXW",
      pricingBasisAssumed: true,
      chinaDomesticTransportEur: 30,
      sourcingAgentFeeEur: 35,
    });
    expect(estimate!.warnings).toEqual(expect.arrayContaining([
      "SUPPLIER_ORIGIN_ASSUMED_CHINA",
      "INCOTERM_ASSUMED_EXW_FOR_1688",
      "CHINA_DOMESTIC_TRANSPORT_ASSUMED",
      "SOURCING_AGENT_FEE_ASSUMED",
    ]));
    expect(estimate!.warnings).not.toContain("LOW_LOGISTICS_CONFIDENCE");
    expect(estimate!.assumptions.join(" ")).toContain("EXW is used only");
    expect(estimate!.assumptions.join(" ")).toContain("domestic China transport");
    expect(estimate!.assumptions.join(" ")).toContain("sourcing/warehouse agent");
    expect(estimate!.assumptions.join(" ")).toContain("Supplier provided unit weight and volume");
  });
});
