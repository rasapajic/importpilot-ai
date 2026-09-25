import { describe, expect, it } from "vitest";

import { getOfferReadiness } from "../../modules/offers/domain/offer-readiness";

describe("offer readiness", () => {
  it("accepts a complete confirmed direct-import offer", () => {
    expect(getOfferReadiness({
      supplierName: "Shenzhen Vision Safety",
      unitPrice: "1.20",
      currency: "USD",
      moq: 500,
      sourceMetadata: {
        offerType: "DIRECT_IMPORT",
        availabilityConfirmed: true,
        b2bPriceConfirmed: true,
      },
    })).toMatchObject({ ready: true, missingFields: [], confirmationIssues: [] });
  });

  it("rejects missing commercial facts and placeholder suppliers", () => {
    const readiness = getOfferReadiness({
      supplierName: "Nepotvrđen prodavac",
      unitPrice: null,
      currency: null,
      moq: null,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingFields).toEqual(["SUPPLIER", "PRICE", "CURRENCY", "MOQ"]);
  });

  it("keeps unconfirmed domestic retail prices out of analysis", () => {
    const readiness = getOfferReadiness({
      supplierName: "Dudi Co.",
      unitPrice: 1099,
      currency: "RSD",
      moq: 100,
      sourceMetadata: {
        offerType: "DOMESTIC",
        availabilityConfirmed: false,
        b2bPriceConfirmed: false,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.confirmationIssues).toEqual(expect.arrayContaining(["AVAILABILITY", "B2B_PRICE"]));
  });
});
