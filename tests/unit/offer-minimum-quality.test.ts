import { describe, expect, it } from "vitest";

import { getOfferMinimumQuality } from "../../modules/offers/domain/offer-minimum-quality";

const validOffer = {
  productTitle: "USB-C PD 20W punjač",
  requestedProduct: "USB-C punjači",
  supplierName: "Dongguan Power Export",
  unitPrice: 4.2,
  currency: "USD",
  productUrl: "https://supplier.example/product/usb-c-charger",
};

describe("offer minimum quality", () => {
  it("accepts an offer with seller, contact, related product and price", () => {
    expect(getOfferMinimumQuality(validOffer)).toEqual({ ready: true, issues: [] });
  });

  it("rejects the unconfirmed seller fixture", () => {
    const result = getOfferMinimumQuality({ ...validOffer, supplierName: "Nepotvrđen prodavac" });
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("SUPPLIER");
  });

  it("rejects missing contact, unrelated products and missing price", () => {
    const result = getOfferMinimumQuality({
      ...validOffer,
      productTitle: "LED baštensko svetlo",
      unitPrice: null,
      productUrl: null,
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(["CONTACT", "PRODUCT_RELATION", "PRICE"]));
  });

  it("accepts seller contact instead of a product URL", () => {
    const result = getOfferMinimumQuality({ ...validOffer, productUrl: null, contactEmail: "sales@example.com" });
    expect(result.ready).toBe(true);
  });
});
