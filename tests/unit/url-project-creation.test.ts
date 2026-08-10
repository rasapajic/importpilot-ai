import { describe, expect, it } from "vitest";

import { createProjectFromUrlRequestSchema } from "../../modules/projects/domain/url-project-creation";

function validRequest() {
  return {
    project: {
      name: "Patio misting system",
      quantity: "100",
      targetCountry: "sr",
      targetMargin: "25",
    },
    offer: {
      title: "Misting System Mist Nozzles",
      supplierName: "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
      supplierCountry: null,
      price: 0.85,
      currency: "usd",
      minimumOrderQuantity: 100,
      incoterm: "fob",
      productUrl: "https://mistingsystem.en.made-in-china.com/product/example/China-Misting-System.html",
      imageUrl: "https://image.made-in-china.com/misting.jpg",
      source: "made-in-china.com",
      marketplaceDetails: null,
      supplierLogistics: null,
    },
  };
}

describe("createProjectFromUrlRequestSchema", () => {
  it("normalizes project and offer fields in one validated request", () => {
    const parsed = createProjectFromUrlRequestSchema.parse(validRequest());

    expect(parsed.project).toMatchObject({
      quantity: 100,
      targetCountry: "RS",
      targetMargin: 25,
    });
    expect(parsed.offer).toMatchObject({
      currency: "USD",
      incoterm: "FOB",
    });
  });

  it("rejects an incomplete offer before any database transaction starts", () => {
    const request = validRequest();
    request.offer.supplierName = "";

    expect(createProjectFromUrlRequestSchema.safeParse(request).success).toBe(false);
  });
});
