import { describe, expect, it } from "vitest";

import { evaluateExplicitProductConstraints } from "../../modules/product-search/domain/explicit-product-constraints";
import { supplierOfferMarketplaceDetailsSchema } from "../../modules/product-search/domain/marketplace-product-details";
import {
  buildPreliminaryOfferComparison,
  comparisonInquiryPriority,
  orderPreliminaryComparisonRows,
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
    expect(rows[0]?.preliminaryDisplayedScore).toBeNull();
    expect(rows[0]?.confidenceScore).toBeNull();
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

describe("provisional advertised score in the comparison", () => {
  it("shows the same capped bonus as the inquiry comparison and does not confirm a purchase price", () => {
    const rows = buildPreliminaryOfferComparison([
      { id: "zlin", supplierName: "Zlin", title: "Wholesale reading glasses", productUrl: "https://example.com/zlin", supplierCountry: "CN", listedMoq: 12, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 1.2, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      { id: "wzouyuan", supplierName: "Wzouyuan", title: "Reading glasses", productUrl: "https://example.com/wzouyuan", supplierCountry: "CN", listedMoq: 100, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 0.35, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      { id: "readsun", supplierName: "Readsun", title: "Reading glasses assorted strengths", productUrl: "https://example.com/readsun", supplierCountry: "CN", listedMoq: 200, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 1, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      { id: "progressive", supplierName: "Progressive Control", title: "Adjustable +4.00 Progressive Multifocal Reading Glasses", productUrl: "https://example.com/progressive", supplierCountry: "CN", listedMoq: 12, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 0.2, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
    ]);

    expect(rows.map((row) => ({
      id: row.id,
      score: row.preliminaryDisplayedScore,
      bonus: row.priceIndicatorBonus,
      confidence: row.confidenceScore,
      purchasePriceConfirmed: row.purchasePriceConfirmed,
      landedCostAvailable: row.landedCostAvailable,
      suitability: row.suitability,
    }))).toEqual([
      { id: "zlin", score: 55, bonus: 0, confidence: 24, purchasePriceConfirmed: false, landedCostAvailable: false, suitability: "NEEDS_CONFIRMATION" },
      { id: "wzouyuan", score: 60, bonus: 5, confidence: 24, purchasePriceConfirmed: false, landedCostAvailable: false, suitability: "NEEDS_CONFIRMATION" },
      { id: "readsun", score: 57, bonus: 2, confidence: 24, purchasePriceConfirmed: false, landedCostAvailable: false, suitability: "NEEDS_CONFIRMATION" },
      { id: "progressive", score: 55, bonus: 0, confidence: 24, purchasePriceConfirmed: false, landedCostAvailable: false, suitability: "DISQUALIFIED" },
    ]);
  });
});

describe("comparison column order", () => {
  function offer(input: {
    id: string;
    supplierName: string;
    title: string;
    price: number | null;
    currency: string | null;
    moq: number;
  }) {
    return {
      id: input.id,
      supplierName: input.supplierName,
      title: input.title,
      productUrl: `https://example.com/${input.id}`,
      supplierCountry: "CN",
      listedMoq: input.moq,
      incoterm: null,
      unitPrice: null,
      currency: null,
      advertisedPrice: input.price,
      advertisedCurrency: input.currency,
      advertisedPriceHigh: null,
      writtenQuoteConfirmed: false,
      productQuery: REQUEST,
      baseAnalysisScore: 55,
      confidenceScore: 24,
    };
  }

  it("orders columns by inquiry priority and keeps each offer id with its supplier", () => {
    const savedOrder = [
      offer({ id: "progressive", supplierName: "Progressive Control", title: "Adjustable +4.00 Progressive Multifocal Reading Glasses", price: 0.2, currency: "USD", moq: 12 }),
      offer({ id: "readsun", supplierName: "Readsun Optical", title: "Reading glasses assorted strengths", price: 1, currency: "USD", moq: 200 }),
      offer({ id: "wzouyuan", supplierName: "Wzouyuan", title: "Reading glasses", price: 0.35, currency: "USD", moq: 100 }),
      offer({ id: "zlin", supplierName: "Zlin Eyewear", title: "Wholesale reading glasses", price: 1.2, currency: "USD", moq: 12 }),
    ];
    const built = buildPreliminaryOfferComparison(savedOrder);
    const inquiry = comparisonInquiryPriority(built);
    const ordered = orderPreliminaryComparisonRows(built, inquiry);

    expect(inquiry.priceUsed).toBe(true);
    expect(ordered.map((row) => row.supplierName)).toEqual([
      "Wzouyuan",
      "Readsun Optical",
      "Zlin Eyewear",
      "Progressive Control",
    ]);
    expect(ordered.map((row) => [row.id, row.preliminaryDisplayedScore, row.confidenceScore, row.suitability])).toEqual([
      ["wzouyuan", 60, 24, "NEEDS_CONFIRMATION"],
      ["readsun", 57, 24, "NEEDS_CONFIRMATION"],
      ["zlin", 55, 24, "NEEDS_CONFIRMATION"],
      ["progressive", 55, 24, "DISQUALIFIED"],
    ]);
    expect(inquiry.priorityById.progressive).toBeUndefined();
  });

  it("shows a 1,200-piece seller minimum without treating its teaser as a price for 1,000", () => {
    const offers = [
      offer({ id: "dilicin", supplierName: "Dilicin", title: "Fixed reading glasses", price: 0.18, currency: "USD", moq: 1200 }),
      offer({ id: "wzouyuan", supplierName: "Wzouyuan", title: "Reading glasses", price: 0.35, currency: "USD", moq: 100 }),
      offer({ id: "readsun", supplierName: "Readsun", title: "Reading glasses", price: 1, currency: "USD", moq: 200 }),
    ];
    const rows = buildPreliminaryOfferComparison(offers, 1000);
    const inquiry = comparisonInquiryPriority(rows, 1000);
    expect(orderPreliminaryComparisonRows(rows, inquiry).map((row) => row.id)).toEqual([
      "wzouyuan", "readsun", "dilicin",
    ]);
    expect(inquiry.priorityById).toEqual({ wzouyuan: 1, readsun: 2 });
    expect(rows.find((row) => row.id === "dilicin")).toMatchObject({
      listedMoq: 1200,
      priceLow: 0.18,
      priceEvidence: "ADVERTISED_PRICE",
      priceIndicatorBonus: 0,
      preliminaryDisplayedScore: 55,
      confidenceScore: 24,
      purchasePriceConfirmed: false,
      landedCostAvailable: false,
    });
  });

  it("keeps saved order and assigns no inquiry numbers when currencies differ", () => {
    const savedOrder = [
      offer({ id: "zlin", supplierName: "Zlin Eyewear", title: "Wholesale reading glasses", price: 1.2, currency: "USD", moq: 12 }),
      offer({ id: "euro", supplierName: "Euro Listing", title: "Reading glasses euro listing", price: 0.9, currency: "EUR", moq: 50 }),
      offer({ id: "missing", supplierName: "Bez iznosa", title: "Reading glasses without a retrieved amount", price: null, currency: null, moq: 80 }),
    ];
    const built = buildPreliminaryOfferComparison(savedOrder);
    const inquiry = comparisonInquiryPriority(built);

    expect(inquiry.priceUsed).toBe(false);
    expect(inquiry.priorityById).toEqual({});
    expect(orderPreliminaryComparisonRows(built, inquiry).map((row) => row.id)).toEqual(["zlin", "euro", "missing"]);
    expect(built.every((row) => row.confidenceScore === 24)).toBe(true);
  });

  it("does not invent a preliminary score when no stored analysis exists", () => {
    const [row] = buildPreliminaryOfferComparison([
      offer({ id: "zlin", supplierName: "Zlin Eyewear", title: "Wholesale reading glasses", price: 1.2, currency: "USD", moq: 12 }),
      offer({ id: "wzouyuan", supplierName: "Wzouyuan", title: "Reading glasses", price: 0.35, currency: "USD", moq: 100 }),
    ].map((item) => ({ ...item, baseAnalysisScore: null, confidenceScore: null })));

    expect(row?.preliminaryDisplayedScore).toBeNull();
    expect(row?.confidenceScore).toBeNull();
    expect(row?.purchasePriceConfirmed).toBe(false);
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
