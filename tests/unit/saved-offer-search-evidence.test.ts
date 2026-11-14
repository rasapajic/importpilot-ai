import { describe, expect, it } from "vitest";

import {
  buildPreliminaryOfferComparison,
  comparisonInquiryPriority,
  orderPreliminaryComparisonRows,
} from "../../modules/product-search/domain/preliminary-offer-comparison";
import { bridgeSavedOfferSearchEvidence, matchingSearchScore } from "../../modules/product-search/domain/saved-offer-search-evidence";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const REQUEST = "naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nije progresivno";

function cached(input: {
  url: string;
  name: string;
  title: string;
  price: number | null;
  currency: string | null;
}): SupplierOfferSearchResult {
  return {
    title: input.title,
    supplierName: input.name,
    supplierCountry: "CN",
    price: input.price,
    currency: input.currency,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl: input.url,
    imageUrl: null,
    source: "Made-in-China",
  };
}

const cache = [
  cached({ url: "https://example.com/wzouyuan?utm_source=ad", name: "Wzouyuan", title: "Reading glasses", price: 0.35, currency: "USD" }),
  cached({ url: "https://example.com/readsun", name: "Readsun Optical", title: "Reading glasses assorted strengths", price: 1, currency: "USD" }),
  cached({ url: "https://example.com/zlin", name: "Zlin Eyewear", title: "Wholesale reading glasses", price: 1.2, currency: "USD" }),
];

describe("saved offer search evidence bridge", () => {
  it("uses the cached search price when the saved offer has a product URL but no advertised price", () => {
    const saved = [
      { id: "readsun", url: "https://example.com/readsun", title: "Reading glasses assorted strengths", moq: 200 },
      { id: "wzouyuan", url: "https://example.com/wzouyuan", title: "Reading glasses", moq: 100 },
      { id: "zlin", url: "https://example.com/zlin", title: "Wholesale reading glasses", moq: 12 },
    ];
    const offers = saved.map((offer) => {
      const evidence = bridgeSavedOfferSearchEvidence({
        productUrl: offer.url,
        storedAdvertisedPrice: null,
        storedAdvertisedCurrency: null,
        storedAdvertisedPriceHigh: null,
        storedTitle: offer.title,
        storedMarketplaceDetails: null,
        cachedResults: cache,
        quantity: 1000,
      });
      return {
        id: offer.id,
        supplierName: offer.id,
        title: evidence.title,
        productUrl: offer.url,
        supplierCountry: "CN",
        listedMoq: offer.moq,
        incoterm: null,
        unitPrice: null,
        currency: null,
        advertisedPrice: evidence.advertisedPrice,
        advertisedCurrency: evidence.advertisedCurrency,
        advertisedPriceHigh: evidence.advertisedPriceHigh,
        writtenQuoteConfirmed: false,
        productQuery: REQUEST,
        baseAnalysisScore: 55,
        confidenceScore: 24,
        missingAdvertisedPriceReason: evidence.missingAdvertisedPriceReason,
      };
    });
    const built = buildPreliminaryOfferComparison(offers);
    const inquiry = comparisonInquiryPriority(built);
    const ordered = orderPreliminaryComparisonRows(built, inquiry);

    expect(offers.every((offer) => offer.unitPrice === null)).toBe(true);
    expect(ordered.map((row) => ({
      id: row.id,
      price: row.priceLow,
      currency: row.priceCurrency,
      score: row.preliminaryDisplayedScore,
      confidence: row.confidenceScore,
      confirmed: row.purchasePriceConfirmed,
      moq: row.listedMoq,
    }))).toEqual([
      { id: "wzouyuan", price: 0.35, currency: "USD", score: 60, confidence: 24, confirmed: false, moq: 100 },
      { id: "readsun", price: 1, currency: "USD", score: 57, confidence: 24, confirmed: false, moq: 200 },
      { id: "zlin", price: 1.2, currency: "USD", score: 55, confidence: 24, confirmed: false, moq: 12 },
    ]);
    expect(inquiry.priorityById).toEqual({ wzouyuan: 1, readsun: 2, zlin: 3 });
  });

  it("keeps a stored advertised price and does not replace it from the cache", () => {
    const evidence = bridgeSavedOfferSearchEvidence({
      productUrl: "https://example.com/wzouyuan",
      storedAdvertisedPrice: 0.5,
      storedAdvertisedCurrency: "USD",
      storedAdvertisedPriceHigh: null,
      storedTitle: "Reading glasses",
      storedMarketplaceDetails: null,
      cachedResults: cache,
      quantity: 1000,
    });

    expect(evidence.advertisedPrice).toBe(0.5);
    expect(evidence.missingAdvertisedPriceReason).toBeNull();
  });

  it("does not take a price from a different product address or from disagreeing snapshots", () => {
    const mismatch = bridgeSavedOfferSearchEvidence({
      productUrl: "https://example.com/other-listing",
      storedAdvertisedPrice: null,
      storedAdvertisedCurrency: null,
      storedAdvertisedPriceHigh: null,
      storedTitle: "Reading glasses",
      storedMarketplaceDetails: null,
      cachedResults: cache,
      quantity: 1000,
    });
    const disagreement = bridgeSavedOfferSearchEvidence({
      productUrl: "https://example.com/wzouyuan",
      storedAdvertisedPrice: null,
      storedAdvertisedCurrency: null,
      storedAdvertisedPriceHigh: null,
      storedTitle: "Reading glasses",
      storedMarketplaceDetails: null,
      cachedResults: [
        cache[0],
        { ...cache[0], price: 9, productUrl: "https://example.com/wzouyuan" },
      ],
      quantity: 1000,
    });

    expect(mismatch.advertisedPrice).toBeNull();
    expect(mismatch.missingAdvertisedPriceReason).toBe("NO_MATCHING_SEARCH_RESULT");
    expect(disagreement.advertisedPrice).toBeNull();
  });

  it("matches a tracking-parameter URL and leaves mixed currencies unranked", () => {
    const evidence = bridgeSavedOfferSearchEvidence({
      productUrl: "https://www.example.com/wzouyuan/",
      storedAdvertisedPrice: null,
      storedAdvertisedCurrency: null,
      storedAdvertisedPriceHigh: null,
      storedTitle: null,
      storedMarketplaceDetails: null,
      cachedResults: cache,
      quantity: 1000,
    });
    const score = matchingSearchScore([
      { productUrl: "https://example.com/wzouyuan?utm_source=ad", overallScore: 55, confidenceScore: 24 },
    ], "https://www.example.com/wzouyuan/");
    const mixed = orderPreliminaryComparisonRows(
      buildPreliminaryOfferComparison([
        { id: "usd", supplierName: "USD", title: "Reading glasses", productUrl: "https://example.com/zlin", supplierCountry: "CN", listedMoq: 12, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 1.2, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
        { id: "eur", supplierName: "EUR", title: "Reading glasses", productUrl: "https://example.com/euro", supplierCountry: "CN", listedMoq: 50, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 0.9, advertisedCurrency: "EUR", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      ]),
      comparisonInquiryPriority(buildPreliminaryOfferComparison([
        { id: "usd", supplierName: "USD", title: "Reading glasses", productUrl: "https://example.com/zlin", supplierCountry: "CN", listedMoq: 12, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 1.2, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
        { id: "eur", supplierName: "EUR", title: "Reading glasses", productUrl: "https://example.com/euro", supplierCountry: "CN", listedMoq: 50, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 0.9, advertisedCurrency: "EUR", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      ])),
    );

    expect(evidence).toMatchObject({ advertisedPrice: 0.35, advertisedCurrency: "USD", title: "Reading glasses" });
    expect(score).toMatchObject({ overallScore: 55, confidenceScore: 24 });
    expect(mixed.map((row) => row.id)).toEqual(["usd", "eur"]);
  });

  it("keeps a cheaper incompatible listing out of the price order", () => {
    const progressive = bridgeSavedOfferSearchEvidence({
      productUrl: "https://example.com/progressive",
      storedAdvertisedPrice: null,
      storedAdvertisedCurrency: null,
      storedAdvertisedPriceHigh: null,
      storedTitle: "Adjustable +4.00 Progressive Multifocal Reading Glasses",
      storedMarketplaceDetails: null,
      cachedResults: [cached({ url: "https://example.com/progressive", name: "Progressive Control", title: "Adjustable +4.00 Progressive Multifocal Reading Glasses", price: 0.2, currency: "USD" })],
      quantity: 1000,
    });
    const rows = buildPreliminaryOfferComparison([
      { id: "progressive", supplierName: "Progressive Control", title: progressive.title, productUrl: "https://example.com/progressive", supplierCountry: "CN", listedMoq: 12, incoterm: null, unitPrice: null, currency: null, advertisedPrice: progressive.advertisedPrice, advertisedCurrency: progressive.advertisedCurrency, advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
      { id: "wzouyuan", supplierName: "Wzouyuan", title: "Reading glasses", productUrl: "https://example.com/wzouyuan", supplierCountry: "CN", listedMoq: 100, incoterm: null, unitPrice: null, currency: null, advertisedPrice: 0.35, advertisedCurrency: "USD", advertisedPriceHigh: null, writtenQuoteConfirmed: false, productQuery: REQUEST, baseAnalysisScore: 55, confidenceScore: 24 },
    ]);

    expect(orderPreliminaryComparisonRows(rows, comparisonInquiryPriority(rows)).map((row) => row.id)).toEqual([
      "wzouyuan",
      "progressive",
    ]);
    expect(rows.find((row) => row.id === "progressive")?.suitability).toBe("DISQUALIFIED");
    expect(rows.find((row) => row.id === "progressive")?.purchasePriceConfirmed).toBe(false);
  });
});
