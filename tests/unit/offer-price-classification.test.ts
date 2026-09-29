import { describe, expect, it } from "vitest";

import { classifyOfferPrice } from "../../modules/offers/domain/offer-price-classification";

describe("offer price classification", () => {
  it("makes only a confirmed and available B2B price eligible", () => {
    const result = classifyOfferPrice({
      unitPrice: 5,
      currency: "EUR",
      sourceMetadata: { b2bPriceConfirmed: true, availabilityConfirmed: true },
    });
    expect(result).toMatchObject({ kind: "CONFIRMED_B2B", analysisEligible: true, rankingEligible: true });
  });

  it("keeps an advertised price visible but out of ranking", () => {
    const result = classifyOfferPrice({ unitPrice: 5, currency: "USD", sourceMetadata: {} });
    expect(result).toMatchObject({ kind: "INDICATIVE", analysisEligible: false, rankingEligible: false });
  });

  it("labels Dudi retail pricing as informational only", () => {
    const result = classifyOfferPrice({
      unitPrice: 1099,
      currency: "RSD",
      sourceMetadata: { offerType: "DOMESTIC", priceIncludesVat: true, b2bPriceConfirmed: false },
    });
    expect(result).toMatchObject({
      kind: "RETAIL",
      label: "Maloprodajna cena — samo informativno",
      statusLabel: "Čeka potvrdu B2B cene",
      analysisEligible: false,
      rankingEligible: false,
    });
  });

  it("rejects a result without price", () => {
    expect(classifyOfferPrice({ unitPrice: null, currency: "USD" })).toMatchObject({
      kind: "NONE",
      analysisEligible: false,
      rankingEligible: false,
    });
  });
});
