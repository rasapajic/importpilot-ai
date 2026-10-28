import { describe, expect, it } from "vitest";

import { evaluateExplicitProductConstraints } from "../../modules/product-search/domain/explicit-product-constraints";
import { supplierOfferMarketplaceDetailsSchema } from "../../modules/product-search/domain/marketplace-product-details";
import {
  buildPreliminaryOfferComparison,
  readStoredMarketplaceDetails,
} from "../../modules/product-search/domain/preliminary-offer-comparison";
import { presentSupplierOfferPrice } from "../../modules/product-search/domain/supplier-quantity-pricing";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const REQUEST = "naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nije progresivno";

describe("preliminary offer comparison", () => {
  it("compares known listing evidence without turning an advertised range into a purchase price", () => {
    const rows = buildPreliminaryOfferComparison([
      {
        id: "zlin",
        supplierName: "Zlin",
        title: "Wholesale reading glasses",
        productUrl: "https://zlineyewear.en.made-in-china.com/product/example.html",
        supplierCountry: "CN",
        listedMoq: 12,
        incoterm: null,
        unitPrice: null,
        currency: null,
        advertisedPrice: 1.2,
        advertisedCurrency: "USD",
        advertisedPriceHigh: 2.9,
        writtenQuoteConfirmed: false,
        productQuery: REQUEST,
      },
      {
        id: "wzouyuan",
        supplierName: "Wzouyuan",
        title: "Adjustable +4.00 Progressive Multifocal Reading Glasses",
        productUrl: "https://wzouyuan.en.made-in-china.com/product/example.html",
        supplierCountry: null,
        listedMoq: 100,
        incoterm: null,
        unitPrice: null,
        currency: null,
        advertisedPrice: null,
        advertisedCurrency: null,
        advertisedPriceHigh: null,
        writtenQuoteConfirmed: false,
        productQuery: REQUEST,
      },
    ]);

    expect(rows[0]).toMatchObject({
      priceEvidence: "ADVERTISED_RANGE",
      priceLow: 1.2,
      priceHigh: 2.9,
      priceCurrency: "USD",
      purchasePriceConfirmed: false,
      landedCostAvailable: false,
      suitability: "NEEDS_CONFIRMATION",
      listedMoq: 12,
      incoterm: null,
    });
    expect(rows[1]).toMatchObject({
      priceEvidence: "UNKNOWN",
      priceLow: null,
      purchasePriceConfirmed: false,
      landedCostAvailable: false,
      suitability: "DISQUALIFIED",
      supplierCountry: null,
    });
  });

  it("keeps a stored unit price unconfirmed unless a written quotation exists", () => {
    const [row] = buildPreliminaryOfferComparison([{
      id: "stored",
      supplierName: "Stored",
      title: "Reading glasses",
      productUrl: null,
      supplierCountry: "CN",
      listedMoq: 200,
      incoterm: "FOB",
      unitPrice: 1.2,
      currency: "USD",
      advertisedPrice: null,
      advertisedCurrency: null,
      advertisedPriceHigh: null,
      writtenQuoteConfirmed: false,
      productQuery: REQUEST,
    }]);

    expect(row).toMatchObject({
      priceEvidence: "ADVERTISED_PRICE",
      purchasePriceConfirmed: false,
      landedCostAvailable: false,
    });
  });

  it("keeps page-evidence suitability consistent between search and comparison", () => {
    const details = supplierOfferMarketplaceDetailsSchema.parse({
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [],
      attributes: [{
        name: "Lens type",
        value: "single vision fixed diopter +1.00 +2.00 +3.50",
        category: "PRODUCT_SPECIFICATION",
      }],
      variants: [],
      packaging: null,
    });
    const offer = {
      id: "fixed",
      supplierName: "Readsun",
      title: "Wholesale reading glasses",
      productUrl: "https://readsunoptical.en.made-in-china.com/product/example.html",
      supplierCountry: "CN",
      listedMoq: 200,
      incoterm: null,
      unitPrice: null,
      currency: null,
      advertisedPrice: null,
      advertisedCurrency: null,
      advertisedPriceHigh: null,
      writtenQuoteConfirmed: false,
      productQuery: REQUEST,
      marketplaceDetails: details,
    };
    const fromSearch = evaluateExplicitProductConstraints(REQUEST, {
      title: offer.title,
      marketplaceDetails: details,
    });
    const [fromComparison] = buildPreliminaryOfferComparison([offer]);
    const [titleOnly] = buildPreliminaryOfferComparison([{
      ...offer,
      marketplaceDetails: null,
    }]);
    const stored = readStoredMarketplaceDetails({ marketplaceDetails: details });

    expect(fromSearch.status).toBe("COMPATIBLE");
    expect(fromComparison?.suitability).toBe(fromSearch.status);
    expect(titleOnly?.suitability).toBe("NEEDS_CONFIRMATION");
    expect(buildPreliminaryOfferComparison([{
      ...offer,
      marketplaceDetails: stored,
    }])[0]?.suitability).toBe("COMPATIBLE");
  });
});

describe("advertised price range presentation", () => {
  it("shows both bounds from the provider field and does not confirm procurement", () => {
    const zlin: SupplierOfferSearchResult = {
      title: "Zlin reading glasses",
      supplierName: "Wenzhou Zlin Eyewear Co., Ltd",
      supplierCountry: "CN",
      price: 1.2,
      currency: "USD",
      advertisedPriceHigh: 2.9,
      minimumOrderQuantity: 12,
      incoterm: null,
      productUrl: "https://zlineyewear.en.made-in-china.com/product/example.html",
      imageUrl: null,
      source: "Made-in-China",
    };

    expect(presentSupplierOfferPrice(zlin, 1000)).toMatchObject({
      kind: "ADVERTISED_ONLY",
      quantityUnitPrice: null,
      advertisedPrice: 1.2,
      advertisedPriceHigh: 2.9,
      supplierOrderQuote: false,
    });
  });

  it("does not invent an upper bound when the source only has one price", () => {
    const single: SupplierOfferSearchResult = {
      title: "Reading glasses",
      supplierName: "Example",
      supplierCountry: "CN",
      price: 1.2,
      currency: "USD",
      minimumOrderQuantity: 12,
      incoterm: null,
      productUrl: "https://example.com/product",
      imageUrl: null,
      source: "Made-in-China",
    };

    expect(presentSupplierOfferPrice(single, 1000).advertisedPriceHigh).toBeNull();
  });
});
