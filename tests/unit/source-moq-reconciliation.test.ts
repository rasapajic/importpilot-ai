import { describe, expect, it } from "vitest";
import {
  exactProductPageIdentity,
  reconcileSourceMoq,
  resultWithSourceMoq,
} from "../../modules/product-search/domain/source-moq-reconciliation";
import { inquiryContactPriority, preliminaryAdvertisedScorePresentation } from "../../modules/product-search/domain/advertised-price-tie-break";
import { presentSupplierOfferPrice } from "../../modules/product-search/domain/supplier-quantity-pricing";
import type { SupplierOfferSearchResult, SupplierOfferUrlPreview } from "../../modules/product-search/domain/search";

const url = "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const saved: SupplierOfferSearchResult = {
  title: "New Model Senior Reading Glasses",
  supplierName: "Dilicin",
  supplierCountry: "CN",
  price: 0.18,
  currency: "USD",
  advertisedPrice: 0.18,
  advertisedCurrency: "USD",
  minimumOrderQuantity: 200,
  incoterm: null,
  productUrl: url,
  imageUrl: null,
  source: "Made-in-China",
};
const page: SupplierOfferUrlPreview = {
  title: saved.title,
  supplierName: saved.supplierName,
  supplierCountry: "CN",
  price: 0.18,
  currency: "USD",
  minimumOrderQuantity: 1200,
  incoterm: null,
  productUrl: url,
  imageUrl: "https://example.com/glasses.jpg",
  source: "dilicin.en.made-in-china.com",
  isPartial: false,
  titleFromSlug: false,
};
const checkedAt = "2026-10-30T22:00:00.000Z";

describe("source MOQ reconciliation #187", () => {
  it("matches exact URL and keeps the historical result immutable", () => {
    const evidence = reconcileSourceMoq(saved, page, checkedAt);
    expect(evidence).toMatchObject({ status: "DIFFERENT", cachedMoq: 200, pageMoq: 1200, checkedAt });
    const display = resultWithSourceMoq(saved, evidence);
    expect(display.minimumOrderQuantity).toBe(1200);
    expect(saved.minimumOrderQuantity).toBe(200);
    expect(display.price).toBe(0.18);
    expect(presentSupplierOfferPrice(display, 1000)).toMatchObject({
      kind: "ADVERTISED_ONLY", quantityUnitPrice: null, advertisedPrice: 0.18,
    });
  });

  it("removes Dilicin's +5 and buyer-quantity price priority but retains the offer", () => {
    const display = resultWithSourceMoq(saved, reconcileSourceMoq(saved, page, checkedAt));
    const candidates = [
      { id: display.productUrl, suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.18, listedMoq: display.minimumOrderQuantity, confirmedPurchasePrice: false },
      { id: "other1", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false },
      { id: "other2", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1, listedMoq: 200, confirmedPurchasePrice: false },
    ];
    expect(inquiryContactPriority(candidates, 1000).priorityById[display.productUrl]).toBeUndefined();
    expect(preliminaryAdvertisedScorePresentation(candidates.map(item => ({ ...item, baseScore: 55 })), 1000)[0]?.priceIndicatorBonus).toBe(0);
  });

  it("does not cross-apply evidence to another similar Dilicin SKU", () => {
    const another = { ...page, productUrl: url.replace("jYzpeDthEMkd", "anotherSku") };
    const evidence = reconcileSourceMoq(saved, another, checkedAt);
    expect(evidence.status).toBe("URL_MISMATCH");
    expect(resultWithSourceMoq(saved, evidence).minimumOrderQuantity).toBe(200);
    expect(exactProductPageIdentity(url)).not.toBe(exactProductPageIdentity(another.productUrl));
  });

  it("treats failures, slug previews and partial pages as unverified", () => {
    for (const preview of [null, { ...page, isPartial: true }, { ...page, titleFromSlug: true }, { ...page, minimumOrderQuantity: null }]) {
      const evidence = reconcileSourceMoq(saved, preview, checkedAt);
      expect(evidence.status).toBe("NOT_VERIFIED");
      expect(resultWithSourceMoq(saved, evidence)).toEqual(saved);
    }
  });

  it("does not interpret trial 12/color as the listed MOQ", () => {
    const preview = { ...page, minimumOrderQuantity: 1200 };
    const evidence = reconcileSourceMoq(saved, preview, checkedAt);
    expect(evidence.pageMoq).toBe(1200);
  });

  it("leaves a consistent or lower seller minimum unaffected", () => {
    const same = { ...saved, minimumOrderQuantity: 100 };
    const evidence = reconcileSourceMoq(same, { ...page, minimumOrderQuantity: 100 }, checkedAt);
    expect(evidence.status).toBe("MATCHED");
    expect(resultWithSourceMoq(same, evidence)).toEqual(same);
  });
});
