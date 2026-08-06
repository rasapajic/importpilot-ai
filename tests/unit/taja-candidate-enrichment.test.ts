import { describe, expect, it } from "vitest";

import {
  mergeTajaCandidateEnrichment,
  tajaCandidateEnrichmentEvidenceScore,
} from "../../modules/product-search/domain/taja-candidate-enrichment";
import {
  TajaLandedCostStatuses,
  useMatchingTajaLandedCost,
  type TajaCandidateEnrichment,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function enrichment(
  overrides: Partial<TajaCandidateEnrichment> = {},
): TajaCandidateEnrichment {
  return {
    supplierVerified: null,
    yearsOnPlatform: null,
    responseRatePercent: null,
    transactionCount: null,
    employeeCount: null,
    profileCompletenessScore: null,
    deliveryTimeDays: null,
    sampleAvailable: null,
    termsClarityScore: null,
    shippingClarityScore: null,
    landedCostPerUnit: null,
    grossMarginPercent: null,
    landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
    landedCostUnitPrice: null,
    landedCostCurrency: null,
    landedCostIncoterm: null,
    ...overrides,
  };
}

function result(
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title: "Industrial fan",
    supplierName: "Supplier",
    supplierCountry: "CN",
    price: 12.5,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.example/product/fan",
    imageUrl: null,
    source: "TAJA web",
    ...overrides,
  };
}

describe("TAJA candidate enrichment preference", () => {
  it("combines current supplier evidence with an older confirmed landed cost", () => {
    const current = enrichment({
      supplierVerified: true,
      yearsOnPlatform: 5,
      responseRatePercent: 95,
      transactionCount: 100,
      profileCompletenessScore: 90,
    });
    const olderConfirmed = enrichment({
      landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
      landedCostPerUnit: 16.2,
      grossMarginPercent: 35,
      landedCostUnitPrice: 12.5,
      landedCostCurrency: "USD",
      landedCostIncoterm: "FOB",
    });

    expect(mergeTajaCandidateEnrichment(current, olderConfirmed)).toMatchObject({
      supplierVerified: true,
      yearsOnPlatform: 5,
      responseRatePercent: 95,
      transactionCount: 100,
      profileCompletenessScore: 90,
      landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
      landedCostPerUnit: 16.2,
      grossMarginPercent: 35,
    });
  });

  it("prefers estimated landed cost over an unavailable record", () => {
    const unavailable = enrichment({ supplierVerified: true, yearsOnPlatform: 5 });
    const estimated = enrichment({
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      landedCostPerUnit: 14,
      grossMarginPercent: 28,
      landedCostUnitPrice: 12.5,
      landedCostCurrency: "USD",
      landedCostIncoterm: "FOB",
    });

    expect(mergeTajaCandidateEnrichment(unavailable, estimated)).toMatchObject({
      supplierVerified: true,
      yearsOnPlatform: 5,
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      landedCostPerUnit: 14,
    });
  });

  it("fills missing fields from the more complete duplicate record", () => {
    const current = enrichment({ supplierVerified: true });
    const older = enrichment({
      supplierVerified: false,
      yearsOnPlatform: 4,
      responseRatePercent: 90,
      transactionCount: 80,
    });

    expect(tajaCandidateEnrichmentEvidenceScore(older))
      .toBeGreaterThan(tajaCandidateEnrichmentEvidenceScore(current));
    expect(mergeTajaCandidateEnrichment(current, older)).toMatchObject({
      supplierVerified: true,
      yearsOnPlatform: 4,
      responseRatePercent: 90,
      transactionCount: 80,
    });
  });

  it("keeps the newest known value when duplicate evidence conflicts", () => {
    const current = enrichment({ supplierVerified: true, yearsOnPlatform: 3 });
    const older = enrichment({ supplierVerified: false, yearsOnPlatform: 8 });

    expect(mergeTajaCandidateEnrichment(current, older)).toMatchObject({
      supplierVerified: true,
      yearsOnPlatform: 3,
    });
  });
});

describe("TAJA landed-cost commercial basis", () => {
  const confirmed = enrichment({
    supplierVerified: true,
    landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
    landedCostPerUnit: 16.2,
    grossMarginPercent: 35,
    landedCostUnitPrice: 12.5,
    landedCostCurrency: "USD",
    landedCostIncoterm: "FOB",
  });

  it("keeps the calculation when price, currency and Incoterm still match", () => {
    expect(useMatchingTajaLandedCost(confirmed, result())).toBe(confirmed);
  });

  it.each([
    ["price", result({ price: 13 })],
    ["currency", result({ currency: "EUR" })],
    ["Incoterm", result({ incoterm: "CIF" })],
  ])("invalidates the old calculation when %s changes", (_field, changedResult) => {
    expect(useMatchingTajaLandedCost(confirmed, changedResult)).toMatchObject({
      supplierVerified: true,
      landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
      landedCostPerUnit: null,
      grossMarginPercent: null,
    });
  });
});
