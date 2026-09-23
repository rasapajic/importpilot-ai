import { describe, expect, it } from "vitest";

import { isLikelyProductImageUrl } from "../../components/search/search-result-image";
import { mergeRecoveredSupplierPreview } from "../../components/search/simple-supplier-offer-search";
import { supplierOfferForQuantity } from "../../components/search/supplier-choice-display";
import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlPreview,
} from "../../modules/product-search/domain/search";

const productUrl = "https://www.alibaba.com/product-detail/Factory-Wholesale-65W-2C-2A-GaN_1601390306760.html";

function result(): SupplierOfferSearchResult {
  return {
    title: "Factory Wholesale 65W 2C + 2A GaN Type-C Charger",
    supplierName: "Shenzhen Vinop Technology Co., Ltd.",
    supplierCountry: "CN",
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl,
    imageUrl: "https://img.alicdn.com/company-logo.png",
    source: "TAJA Alibaba",
  };
}

function preview(): SupplierOfferUrlPreview {
  return {
    title: result().title,
    supplierName: result().supplierName,
    supplierCountry: "CN",
    price: 6.16,
    currency: "EUR",
    minimumOrderQuantity: 2,
    incoterm: null,
    productUrl,
    imageUrl: "https://sc04.alicdn.com/kf/Hvinop-65w-yellow-charger.jpg",
    source: "www.alibaba.com",
    details: {
      adapter: "alibaba-product-page-v1",
      evidence: "PRODUCT_PAGE",
      priceTiers: [
        { price: 6.16, currency: "EUR", minQuantity: 2, maxQuantity: 99 },
        { price: 6.08, currency: "EUR", minQuantity: 100, maxQuantity: 999 },
        { price: 5.99, currency: "EUR", minQuantity: 1_000, maxQuantity: 4_999 },
        { price: 5.9, currency: "EUR", minQuantity: 5_000, maxQuantity: null },
      ],
      attributes: [],
      variants: [],
      packaging: null,
    },
    isPartial: false,
    titleFromSlug: false,
  };
}

describe("supplier result exact-page recovery", () => {
  it("replaces a marketplace logo with the exact product image", () => {
    const recovered = mergeRecoveredSupplierPreview(result(), preview());
    expect(isLikelyProductImageUrl(result().imageUrl)).toBe(false);
    expect(recovered.imageUrl).toBe("https://sc04.alicdn.com/kf/Hvinop-65w-yellow-charger.jpg");
  });

  it("uses the 100-999 tier for an order of 500 pieces", () => {
    const recovered = mergeRecoveredSupplierPreview(result(), preview());
    expect(supplierOfferForQuantity(recovered, 500)).toMatchObject({
      price: 6.08,
      currency: "EUR",
    });
  });

  it("replaces a corrupted cached price with authoritative exact-page pricing", () => {
    const stale = {
      ...result(),
      price: 545,
      currency: "USD",
      minimumOrderQuantity: 100,
    };

    expect(mergeRecoveredSupplierPreview(stale, preview())).toMatchObject({
      price: 6.16,
      currency: "EUR",
      minimumOrderQuantity: 2,
    });
  });
});
