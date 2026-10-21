import { describe, expect, it } from "vitest";

import { quantityPriceSnapshots } from "../../components/search/supplier-choice-display";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";
import {
  applySupplierOfferQuantityPrice,
  assessSupplierOfferQuantityPrice,
  assessSupplierOrderTerms,
} from "../../modules/product-search/domain/supplier-quantity-pricing";
import { estimateTajaPreliminaryLandedCost } from "../../modules/product-search/domain/taja-preliminary-cost-estimate";

const yougeTiers = [
  { price: 1.3, currency: "USD", minQuantity: 12, maxQuantity: 499 },
  { price: 1.1, currency: "USD", minQuantity: 500, maxQuantity: 1_199 },
  { price: 0.9, currency: "USD", minQuantity: 1_200, maxQuantity: 4_999 },
  { price: 0.7, currency: "USD", minQuantity: 5_000, maxQuantity: null },
];

function offer(
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title: "Reading glasses",
    supplierName: "Wenzhou Youge Eyewear Co., Ltd.",
    supplierCountry: "CN",
    price: 0.7,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl: "https://ugeeyewear.en.made-in-china.com/product/example.html",
    imageUrl: null,
    source: "made-in-china.com",
    priceEvidence: "MARKETPLACE_SEARCH",
    marketplaceDetails: null,
    ...overrides,
  };
}

function yougeOffer(): SupplierOfferSearchResult {
  return offer({
    marketplaceDetails: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: yougeTiers,
      attributes: [],
      variants: [],
      packaging: null,
    },
  });
}

describe("quantity-aware supplier pricing", () => {
  it("does not let a search-snippet tier confirm the price for 500 pieces", () => {
    const snippet = offer({
      marketplaceDetails: {
        adapter: "made-in-china-search-card",
        evidence: "SEARCH_SNIPPET",
        priceTiers: yougeTiers,
        attributes: [],
        variants: [],
        packaging: null,
      },
    });

    expect(assessSupplierOfferQuantityPrice(snippet, 500)).toMatchObject({
      advertisedPrice: 0.7,
      quantityUnitPrice: null,
      basis: "INFORMATIONAL",
      procurementCostConfirmed: false,
      supplierOrderQuote: false,
    });
    expect(applySupplierOfferQuantityPrice(snippet, 500).price).toBe(0.7);
    expect(estimateTajaPreliminaryLandedCost({
      result: { ...snippet, currency: "EUR", price: 0.7 },
      quantity: 500,
      targetCountry: "RS",
      targetMarginPercent: 0,
      fxSnapshot: null,
    })).toBeNull();
  });

  it("uses the Youge tier of 1.10 USD for 500 pieces when that tier is published", () => {
    const pricing = assessSupplierOfferQuantityPrice(yougeOffer(), 500);

    expect(pricing).toMatchObject({
      advertisedPrice: 0.7,
      quantityUnitPrice: 1.1,
      quantityCurrency: "USD",
      basis: "PRODUCT_PAGE_TIER",
      supplierOrderQuote: false,
      procurementCostConfirmed: true,
    });
    expect(applySupplierOfferQuantityPrice(yougeOffer(), 500).price).toBe(1.1);
    expect(quantityPriceSnapshots(yougeOffer(), 500)).toEqual(
      expect.arrayContaining([
        { quantity: 500, price: 1.1, currency: "USD", confirmedByTier: true },
      ]),
    );
  });

  it("uses the Youge tier of 0.70 USD only from 5000 pieces", () => {
    const pricing = assessSupplierOfferQuantityPrice(yougeOffer(), 5_000);

    expect(pricing.quantityUnitPrice).toBe(0.7);
    expect(pricing.procurementCostConfirmed).toBe(true);
    expect(pricing.supplierOrderQuote).toBe(false);
    expect(applySupplierOfferQuantityPrice(yougeOffer(), 5_000).price).toBe(0.7);
  });

  it("keeps the Youge advertised floor informational until a covering tier exists", () => {
    const pricing = assessSupplierOfferQuantityPrice(offer(), 500);

    expect(pricing).toMatchObject({
      advertisedPrice: 0.7,
      advertisedCurrency: "USD",
      quantityUnitPrice: null,
      quantityCurrency: null,
      basis: "INFORMATIONAL",
      supplierOrderQuote: false,
      procurementCostConfirmed: false,
    });
    expect(applySupplierOfferQuantityPrice(offer(), 500).price).toBe(0.7);
    expect(quantityPriceSnapshots(offer(), 500)).toEqual([
      { quantity: 500, price: null, currency: null, confirmedByTier: false },
      { quantity: 1_000, price: null, currency: null, confirmedByTier: false },
    ]);
    expect(estimateTajaPreliminaryLandedCost({
      result: offer({ currency: "EUR", price: 0.7 }),
      quantity: 500,
      targetCountry: "RS",
      targetMarginPercent: 0,
      fxSnapshot: null,
    })).toBeNull();
  });

  it("prices a confirmed Youge quantity from its tier, not from the advertised floor", () => {
    const eurTiers = yougeTiers.map((tier) => ({ ...tier, currency: "EUR" }));
    const estimate = estimateTajaPreliminaryLandedCost({
      result: offer({
        price: 0.7,
        currency: "EUR",
        marketplaceDetails: {
          adapter: "made-in-china-product-page-v2",
          evidence: "PRODUCT_PAGE",
          priceTiers: eurTiers,
          attributes: [],
          variants: [],
          packaging: null,
        },
      }),
      quantity: 500,
      targetCountry: "RS",
      targetMarginPercent: 0,
      fxSnapshot: null,
    });

    expect(estimate?.goodsCostEur).toBe(550);
    expect(estimate?.assumptions.join(" ")).toContain("not a supplier quotation");
  });

  it("leaves the Zlin price for exactly 500 unknown without a covering tier", () => {
    const zlin = offer({
      title: "Zlin reading glasses",
      supplierName: "Wenzhou Zlin Eyewear Co., Ltd",
      price: 1.2,
      currency: "USD",
      minimumOrderQuantity: 12,
      productUrl: "https://zlineyewear.en.made-in-china.com/product/example.html",
      marketplaceDetails: null,
    });

    expect(assessSupplierOfferQuantityPrice(zlin, 500)).toMatchObject({
      advertisedPrice: 1.2,
      quantityUnitPrice: null,
      basis: "INFORMATIONAL",
      procurementCostConfirmed: false,
      supplierOrderQuote: false,
    });
    expect(estimateTajaPreliminaryLandedCost({
      result: zlin,
      quantity: 500,
      targetCountry: "RS",
      targetMarginPercent: 0,
    })).toBeNull();
  });

  it("does not confirm mixing 500 diopters when Ouyuan states separate MOQ kinds", () => {
    const terms = assessSupplierOrderTerms({
      requestedQuantity: 500,
      variantMixRequested: true,
      mixingExplicitlyConfirmed: null,
      conditions: [
        { kind: "STOCK", quantity: 100, scope: "ORDER" },
        { kind: "VARIANT", quantity: 12, scope: "COLOR" },
        { kind: "PRODUCTION", quantity: 600, scope: "MODEL" },
      ],
    });

    expect(terms).toEqual({
      stockMoq: 100,
      productionMoq: 600,
      variantMoq: 12,
      conditionsReliable: true,
      mixingStatus: "UNCONFIRMED",
      orderQuantityConfirmed: null,
    });
  });

  it("marks contradictory or missing order terms as unconfirmed", () => {
    expect(assessSupplierOrderTerms({
      requestedQuantity: 500,
      variantMixRequested: true,
      mixingExplicitlyConfirmed: true,
      conditions: [
        { kind: "STOCK", quantity: 100, scope: "ORDER" },
        { kind: "STOCK", quantity: 12, scope: "ORDER" },
      ],
    })).toMatchObject({
      stockMoq: null,
      conditionsReliable: false,
      mixingStatus: "UNCONFIRMED",
      orderQuantityConfirmed: null,
    });

    expect(assessSupplierOrderTerms({
      requestedQuantity: 500,
      variantMixRequested: true,
      mixingExplicitlyConfirmed: null,
      conditions: [],
    })).toMatchObject({
      conditionsReliable: false,
      mixingStatus: "UNCONFIRMED",
      orderQuantityConfirmed: null,
    });
  });
});
