import { describe, expect, it } from "vitest";

import type { SupplierOfferUrlPreview } from "../../modules/product-search/domain/search";
import {
  buildTajaPreviewBusinessSummary,
  TajaPreviewBusinessStatuses,
  TajaPreviewLandedCostStatuses,
  TajaPreviewMoqStatuses,
  TajaPreviewNextActions,
  TajaPreviewPriceBasisStatuses,
} from "../../modules/product-search/domain/taja-preview-business-summary";
import {
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
} from "../../modules/product-search/domain/taja-product-form";
import {
  TajaRequirementEvidenceStatuses,
  TajaRequirementMatchStatuses,
} from "../../modules/product-search/domain/taja-requirement-match";

const productUrl = "https://mistingsystem.en.made-in-china.com/product/example/China-Misting-System.html";
const query = "Vodena magla za terasu sa pumpom i 20 mlaznica";

function preview(
  overrides: Partial<SupplierOfferUrlPreview> = {},
): SupplierOfferUrlPreview {
  return {
    title: "China Misting System Mist Nozzles Outdoor Nozzles",
    supplierName: "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
    supplierCountry: "CN",
    price: 0.85,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl,
    imageUrl: "https://image.made-in-china.com/misting.jpg",
    source: "made-in-china.com",
    details: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [
        { price: 0.85, currency: "USD", minQuantity: 100, maxQuantity: 999 },
      ],
      attributes: [
        { name: "Pump", value: "Plunger", category: "PRODUCT_SPECIFICATION" },
        { name: "Nozzle", value: "100-600PCS", category: "PRODUCT_SPECIFICATION" },
      ],
      variants: [
        { name: "Voltage", values: ["110 V", "220 V", "380 V"] },
      ],
      packaging: {
        sellingUnit: null,
        packageType: "Wooden",
        packageLengthCm: 10,
        packageWidthCm: 10,
        packageHeightCm: 10,
        grossWeightKg: 10,
        piecesPerCarton: null,
        scope: "UNKNOWN",
        confidence: "LOW",
        usableForLandedCost: false,
        validationNote: "Package dimensions and weight produce an implausible packaged density.",
      },
    },
    isPartial: false,
    titleFromSlug: false,
    ...overrides,
  };
}

describe("TAJA preview business summary", () => {
  it("flags the real mixed system/nozzle offer for price-unit confirmation", () => {
    const summary = buildTajaPreviewBusinessSummary(preview(), {
      productQuery: query,
      requestedQuantity: 100,
    });

    expect(summary).toMatchObject({
      status: TajaPreviewBusinessStatuses.REVIEW,
      productForm: TajaOfferProductForms.UNCLEAR,
      productFormMatchStatus: TajaProductFormMatchStatuses.UNCLEAR,
      requirementMatchStatus: TajaRequirementMatchStatuses.PARTIAL,
      requestedCompleteSystem: true,
      requestedNozzleCount: 20,
      pumpStatus: TajaRequirementEvidenceStatuses.CONFIRMED,
      pumpValue: "Plunger",
      nozzleStatus: TajaRequirementEvidenceStatuses.CONFIRMED,
      nozzleValue: "100-600PCS",
      nozzleCountStatus: TajaRequirementEvidenceStatuses.UNCONFIRMED,
      priceBasisStatus: TajaPreviewPriceBasisStatuses.UNCONFIRMED,
      moqStatus: TajaPreviewMoqStatuses.OK,
      landedCostStatus: TajaPreviewLandedCostStatuses.BLOCKED_PRICE_BASIS,
      nextAction: TajaPreviewNextActions.CONFIRM_PRICE_AND_CONTENTS,
    });
  });

  it("marks a fully evidenced complete kit as ready for preliminary costing", () => {
    const complete = preview({
      title: "Patio Misting Cooling System Kit",
      details: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
        priceTiers: [
          { price: 12, currency: "USD", minQuantity: 100, maxQuantity: 499 },
        ],
        attributes: [
          { name: "Application", value: "Patio and terrace", category: "PRODUCT_SPECIFICATION" },
          { name: "Kit Contents", value: "Pump and 20 brass misting nozzles included", category: "PRODUCT_SPECIFICATION" },
        ],
        variants: [],
        packaging: {
          sellingUnit: "Set",
          packageType: "Carton",
          packageLengthCm: 40,
          packageWidthCm: 30,
          packageHeightCm: 20,
          grossWeightKg: 8,
          piecesPerCarton: 1,
          scope: "CARTON",
          confidence: "HIGH",
          usableForLandedCost: true,
          validationNote: null,
        },
      },
      price: 12,
    });

    const summary = buildTajaPreviewBusinessSummary(complete, {
      productQuery: query,
      requestedQuantity: 100,
    });

    expect(summary).toMatchObject({
      status: TajaPreviewBusinessStatuses.READY,
      productForm: TajaOfferProductForms.COMPLETE_SYSTEM,
      productFormMatchStatus: TajaProductFormMatchStatuses.MATCH,
      requirementMatchStatus: TajaRequirementMatchStatuses.FULL,
      priceBasisStatus: TajaPreviewPriceBasisStatuses.CONFIRMED,
      moqStatus: TajaPreviewMoqStatuses.OK,
      landedCostStatus: TajaPreviewLandedCostStatuses.READY_FOR_ESTIMATE,
      nextAction: TajaPreviewNextActions.READY_TO_COMPARE,
    });
  });

  it("blocks a clear component from complete-system comparison", () => {
    const component = preview({
      title: "Replacement Brass Misting Nozzle Pack",
      details: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
        priceTiers: [],
        attributes: [],
        variants: [],
        packaging: null,
      },
    });

    const summary = buildTajaPreviewBusinessSummary(component, {
      productQuery: query,
      requestedQuantity: 100,
    });

    expect(summary).toMatchObject({
      status: TajaPreviewBusinessStatuses.BLOCKED,
      productForm: TajaOfferProductForms.NOZZLES_ONLY,
      productFormMatchStatus: TajaProductFormMatchStatuses.MISMATCH,
      nextAction: TajaPreviewNextActions.DO_NOT_COMPARE_AS_REQUESTED_PRODUCT,
    });
  });

  it("blocks quantities below a known MOQ after the price basis is confirmed", () => {
    const complete = preview({
      title: "Complete Patio Misting System Kit with Pump and 20 Nozzles",
      minimumOrderQuantity: 100,
      details: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
        priceTiers: [],
        attributes: [
          { name: "Application", value: "Patio", category: "PRODUCT_SPECIFICATION" },
          { name: "Kit Contents", value: "Pump and 20 nozzles included", category: "PRODUCT_SPECIFICATION" },
        ],
        variants: [],
        packaging: {
          sellingUnit: "Set",
          packageType: "Carton",
          packageLengthCm: 40,
          packageWidthCm: 30,
          packageHeightCm: 20,
          grossWeightKg: 8,
          piecesPerCarton: 1,
          scope: "CARTON",
          confidence: "HIGH",
          usableForLandedCost: true,
          validationNote: null,
        },
      },
    });

    const summary = buildTajaPreviewBusinessSummary(complete, {
      productQuery: query,
      requestedQuantity: 50,
    });

    expect(summary).toMatchObject({
      status: TajaPreviewBusinessStatuses.BLOCKED,
      moqStatus: TajaPreviewMoqStatuses.BLOCKING,
      landedCostStatus: TajaPreviewLandedCostStatuses.BLOCKED_MOQ,
      nextAction: TajaPreviewNextActions.NEGOTIATE_MOQ,
    });
  });
});
