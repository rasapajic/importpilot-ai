import { describe, expect, it } from "vitest";

import { buildSupplierConfirmationBrief } from "../../modules/negotiation/domain/supplier-confirmation";
import {
  supplierFollowUpQuestions,
  translationPreservesCommercialFacts,
} from "../../modules/negotiation/domain/supplier-message";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const zlinTiers = [
  { price: 1.3, currency: "USD", minQuantity: 12, maxQuantity: 499 },
  { price: 1.1, currency: "USD", minQuantity: 500, maxQuantity: 4_999 },
  { price: 0.7, currency: "USD", minQuantity: 5_000, maxQuantity: null },
];

function zlinOffer(): SupplierOfferSearchResult {
  return {
    title: "Reading glasses",
    supplierName: "Wenzhou Zlin Eyewear Co., Ltd.",
    supplierCountry: "CN",
    price: 0.7,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl: "https://zlin.en.made-in-china.com/product/example.html",
    imageUrl: null,
    source: "made-in-china.com",
    marketplaceDetails: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: zlinTiers,
      attributes: [],
      variants: [],
      packaging: null,
    },
  };
}

describe("Serbian supplier inquiry", () => {
  it("fills a Zlin RFQ for 1000 reading glasses to Serbia without inventing a model", () => {
    const brief = buildSupplierConfirmationBrief({
      result: zlinOffer(),
      productName: "naočare za čitanje",
      quantity: 1_000,
      destination: "RS",
    });

    expect(brief.model).toBeNull();
    expect(brief.serbianSubject).toContain("naočare za čitanje");
    expect(brief.serbianBody).toContain("Poštovani tim Wenzhou Zlin Eyewear Co., Ltd.,");
    expect(brief.serbianBody).toContain("ne narudžbina");
    expect(brief.serbianBody).toContain("Količina: 1.000 komada.");
    expect(brief.serbianBody).toContain("Destinacija: Srbija.");
    expect(brief.serbianBody).toContain("+1.00, +1.50, +2.00, +2.50, +3.00, +3.50");
    expect(brief.serbianBody).toContain("MOQ");
    expect(brief.serbianBody).toContain("Incoterm iz oglasa: FOB.");
    expect(brief.serbianBody).toContain("1.1 USD");
    expect(brief.serbianBody).toContain("To nije pisana ponuda.");
    expect(brief.serbianBody).not.toContain("Model:");
    expect(brief.body).toContain("Dear Wenzhou Zlin Eyewear Co., Ltd. team,");
  });
});

describe("commercial fact preservation", () => {
  const source = [
    "Poštovani tim Wenzhou Zlin Eyewear Co., Ltd.,",
    "Količina: 1.000 komada.",
    "Cena 1.1 USD. MOQ 12. FOB.",
    "Dioptrije +1.00, +1.50, +2.00, +2.50, +3.00, +3.50.",
  ].join("\n");

  it("accepts an English rendering that keeps every commercial token", () => {
    const translation = [
      "Dear Wenzhou Zlin Eyewear Co., Ltd. team,",
      "Quantity: 1,000 pieces.",
      "Price 1.1 USD. MOQ 12. FOB.",
      "Diopters +1.00, +1.50, +2.00, +2.50, +3.00, +3.50.",
    ].join("\n");
    expect(translationPreservesCommercialFacts(source, translation, {
      literals: ["Wenzhou Zlin Eyewear Co., Ltd."],
    }).preserved).toBe(true);
  });

  it("rejects a dropped diopter or a changed price", () => {
    const dropped = "Quantity 1,000. Price 1.1 USD. MOQ 12. FOB. Diopters +1.00, +1.50, +2.00, +2.50, +3.00. Wenzhou Zlin Eyewear Co., Ltd.";
    const changed = "Quantity 1,000. Price 1.2 USD. MOQ 12. FOB. Diopters +1.00, +1.50, +2.00, +2.50, +3.00, +3.50. Wenzhou Zlin Eyewear Co., Ltd.";
    expect(translationPreservesCommercialFacts(source, dropped).missing).toContain("+3.50");
    expect(translationPreservesCommercialFacts(source, changed).missing).toContain("1.1");
  });

  it("requires every fact twice when the message is sent in English and Chinese", () => {
    const once = "1,000 pieces, 1.1 USD, MOQ 12, FOB, +1.00, +1.50, +2.00, +2.50, +3.00, +3.50, Wenzhou Zlin Eyewear Co., Ltd.";
    const twice = `${once}\n---\n${once}`;
    expect(translationPreservesCommercialFacts(source, once, { minimumCopies: 2 }).preserved).toBe(false);
    expect(translationPreservesCommercialFacts(source, twice, {
      literals: ["Wenzhou Zlin Eyewear Co., Ltd."],
      minimumCopies: 2,
    }).preserved).toBe(true);
  });
});

describe("supplier follow-up questions", () => {
  it("asks only for the commercial facts the reply left open", () => {
    const questions = supplierFollowUpQuestions({
      replySaved: true,
      readingGlasses: true,
      priceStated: true,
      priceCoversQuantity: true,
      moqStated: true,
      moqTooHigh: false,
      mixingStated: false,
      incotermStated: true,
      leadTimeStated: false,
      mentionsSupply: false,
    });
    expect(questions.join(" ")).toContain("dioptrije");
    expect(questions.join(" ")).toContain("rok isporuke");
    expect(questions.join(" ")).toContain("zalihama");
    expect(questions.join(" ")).not.toContain("jediničnu cenu");
    expect(supplierFollowUpQuestions({
      replySaved: false,
      readingGlasses: true,
      priceStated: false,
      priceCoversQuantity: false,
      moqStated: false,
      moqTooHigh: false,
      mixingStated: false,
      incotermStated: false,
      leadTimeStated: false,
      mentionsSupply: false,
    })).toEqual([]);
  });
});
