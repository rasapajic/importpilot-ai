import { describe, expect, it } from "vitest";

import { buildSupplierConfirmationBrief } from "../../modules/negotiation/domain/supplier-confirmation";
import {
  outboundTranslationRendersTargetLanguage,
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

  it("does not address a supplier by an internet domain or invent a company name", () => {
    const brief = buildSupplierConfirmationBrief({
      result: {
        ...zlinOffer(),
        supplierName: "zlineyewear.en.made-in-china.com",
      },
      productName: "naočare za čitanje",
      quantity: 1_000,
      destination: "RS",
    });

    expect(brief.serbianBody.startsWith("Poštovani,")).toBe(true);
    expect(brief.body.startsWith("Dear Supplier,")).toBe(true);
    expect(brief.serbianBody).not.toContain("zlineyewear.en.made-in-china.com");
    expect(brief.body).not.toContain("zlineyewear.en.made-in-china.com");
    expect(brief.serbianBody).not.toContain("Zlin");
    expect(brief.body).not.toContain("Zlin");
    expect(brief.serbianBody).toContain("Količina: 1.000 komada.");
    expect(brief.body).toContain("Quantity: 1,000 pieces.");
    expect(brief.body).toContain("Unit price for 1,000 pieces");
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

  it("requires translated units and target number formatting in English and Simplified Chinese", () => {
    const commercial = "Cena 1.1 USD. MOQ 12. FOB. Dioptrije +1.00, +1.50, +2.00, +2.50, +3.00, +3.50.";
    for (const quantity of ["1.000", "1000", "1,000"]) {
      const serbian = `Količina: ${quantity} komada. Jediničnu cenu za ${quantity} komada. ${commercial}`;
      const copied = `Quantity: ${quantity} komada. Unit price for ${quantity} komada. Price 1.1 USD. MOQ 12. FOB. Diopters +1.00, +1.50, +2.00, +2.50, +3.00, +3.50.`;
      const english = [
        "Dear Supplier,",
        "Quantity: 1,000 pieces.",
        "Unit price for 1,000 pieces.",
        "Price 1.1 USD. MOQ 12. FOB.",
        "Diopters +1.00, +1.50, +2.00, +2.50, +3.00, +3.50.",
      ].join("\n");
      const chinese = [
        "您好：",
        "数量：1,000件。",
        "1,000件的单价。",
        "价格 1.1 USD。MOQ 12。FOB。",
        "度数 +1.00、+1.50、+2.00、+2.50、+3.00、+3.50。",
      ].join("\n");

      expect(outboundTranslationRendersTargetLanguage(serbian, copied, "EN").complete).toBe(false);
      expect(outboundTranslationRendersTargetLanguage(serbian, english, "EN")).toMatchObject({ complete: true });
      expect(outboundTranslationRendersTargetLanguage(serbian, chinese, "ZH")).toMatchObject({ complete: true });
      expect(outboundTranslationRendersTargetLanguage(serbian, `${english}\n---\n${chinese}`, "EN_ZH").complete).toBe(true);
      expect(translationPreservesCommercialFacts(serbian, english).preserved).toBe(true);
      expect(translationPreservesCommercialFacts(serbian, chinese).preserved).toBe(true);
      expect(translationPreservesCommercialFacts(serbian, english.replace("1.1 USD", "1.2 USD")).missing).toContain("1.1");
      expect(translationPreservesCommercialFacts(serbian, english.replace("+3.50", "+3.00")).missing).toContain("+3.50");
    }

    const domainSource = "Poštovani tim zlineyewear.en.made-in-china.com,\nKoličina: 1.000 komada. Cena 1.1 USD.";
    const domainGreeting = "Dear team zlineyewear.en.made-in-china.com,\nQuantity: 1,000 pieces. Price 1.1 USD.";
    expect(outboundTranslationRendersTargetLanguage(domainSource, domainGreeting, "EN").problems).toContain("domain-salutation");
    expect(outboundTranslationRendersTargetLanguage(
      domainSource,
      "Dear Supplier,\nQuantity: 1,000 pieces. Price 1.1 USD.",
      "EN",
    ).complete).toBe(true);
  });

  it("keeps model years and codes while formatting a real quantity of 1,000", () => {
    const source = "Zlin 2025 Retro Round, X5000, ISO 9001, Količina: 1.000 komada. Cena 1.1 USD. Dioptrija +1.50.";
    const english = "Zlin 2025 Retro Round, X5000, ISO 9001, Quantity: 1,000 pieces. Price 1.1 USD. Diopter +1.50.";
    const chinese = "Zlin 2025 Retro Round, X5000, ISO 9001, 数量：1,000件。价格 1.1 USD。度数 +1.50。";
    const combined = `${english}\n---\n${chinese}`;
    const regroupedYear = "Zlin 2,025 Retro Round, X5000, ISO 9001, Quantity: 1,000 pieces. Price 1.1 USD. Diopter +1.50.";
    const regroupedModel = "Zlin 2025 Retro Round, X5,000, ISO 9001, Quantity: 1,000 pieces. Price 1.1 USD. Diopter +1.50.";
    const regroupedStandard = "Zlin 2025 Retro Round, X5000, ISO 9,001, Quantity: 1,000 pieces. Price 1.1 USD. Diopter +1.50.";
    const copiedUnits = "Zlin 2025 Retro Round, X5000, ISO 9001, Količina: 1.000 komada. Cena 1.1 USD. Dioptrija +1.50.";

    expect(outboundTranslationRendersTargetLanguage(source, english, "EN")).toMatchObject({
      complete: true,
      problems: [],
    });
    expect(outboundTranslationRendersTargetLanguage(source, english, "EN").problems).not.toContain("2,025");
    expect(outboundTranslationRendersTargetLanguage(source, chinese, "ZH")).toMatchObject({ complete: true });
    expect(outboundTranslationRendersTargetLanguage(source, "Zlin 2025 Retro Round, X5000, ISO 9001, 数量：1000件。价格 1.1 USD。度数 +1.50。", "ZH").complete).toBe(true);
    expect(outboundTranslationRendersTargetLanguage(source, combined, "EN_ZH")).toMatchObject({ complete: true });

    expect(outboundTranslationRendersTargetLanguage(source, regroupedYear, "EN").problems).toEqual(["Zlin 2025 Retro Round"]);
    expect(outboundTranslationRendersTargetLanguage(source, regroupedYear, "EN").problems).not.toContain("2,025");
    expect(outboundTranslationRendersTargetLanguage(source, regroupedModel, "EN").problems).toContain("X5000");
    expect(outboundTranslationRendersTargetLanguage(source, regroupedStandard, "EN").problems).toContain("ISO 9001");
    expect(outboundTranslationRendersTargetLanguage(source, copiedUnits, "EN").complete).toBe(false);
    expect(outboundTranslationRendersTargetLanguage(source, `${regroupedYear}\n---\n${chinese}`, "EN_ZH").complete).toBe(false);

    expect(translationPreservesCommercialFacts(source, english).preserved).toBe(true);
    expect(translationPreservesCommercialFacts(source, chinese).preserved).toBe(true);
    expect(translationPreservesCommercialFacts(source, combined, { minimumCopies: 2 }).preserved).toBe(true);
    expect(translationPreservesCommercialFacts(source, english.replace("1.1 USD", "1.2 USD")).missing).toContain("1.1");
    expect(translationPreservesCommercialFacts(source, english.replace("+1.50", "")).missing).toContain("+1.50");

    const quantityYear = "Količina: 2025 komada.";
    expect(outboundTranslationRendersTargetLanguage(quantityYear, "Quantity: 2,025 pieces.", "EN")).toMatchObject({ complete: true });
    expect(outboundTranslationRendersTargetLanguage(quantityYear, "Quantity: 2025 pieces.", "EN").problems).toContain("2,025");
    expect(outboundTranslationRendersTargetLanguage(quantityYear, "数量：2,025件。", "ZH").complete).toBe(true);
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
