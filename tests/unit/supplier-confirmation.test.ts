import { describe, expect, it } from "vitest";

import {
  buildSupplierConfirmationBrief,
  confirmSupplierTerm,
  confirmedCalculationInput,
  createPreparedConfirmation,
  markInquirySent,
  saveSupplierReply,
  SupplierConfirmationStatuses,
} from "../../modules/negotiation/domain/supplier-confirmation";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const yougeTiers = [
  { price: 1.3, currency: "USD", minQuantity: 12, maxQuantity: 499 },
  { price: 1.1, currency: "USD", minQuantity: 500, maxQuantity: 1_199 },
  { price: 0.9, currency: "USD", minQuantity: 1_200, maxQuantity: 4_999 },
  { price: 0.7, currency: "USD", minQuantity: 5_000, maxQuantity: null },
];

function glassesOffer(): SupplierOfferSearchResult {
  return {
    title: "Wholesale reading glasses model 18107",
    supplierName: "Wenzhou Youge Eyewear Co., Ltd.",
    supplierCountry: "CN",
    price: 0.7,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl: "https://ugeeyewear.en.made-in-china.com/product/example.html",
    imageUrl: null,
    source: "made-in-china.com",
    marketplaceDetails: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: yougeTiers,
      attributes: [{ name: "Model", value: "18107", category: "PRODUCT_SPECIFICATION" }],
      variants: [],
      packaging: null,
    },
  };
}

describe("supplier confirmation request", () => {
  it("prepares an English RFQ for 1000 mixed reading glasses without sending it", () => {
    const brief = buildSupplierConfirmationBrief({
      result: glassesOffer(),
      productName: "naočare za čitanje",
      quantity: 1_000,
      destination: "RS",
    });

    expect(brief.readingGlasses).toBe(true);
    expect(brief.model).toBe("18107");
    expect(brief.quantity).toBe(1_000);
    expect(brief.destination).toBe("Serbia");
    expect(brief.publicEvidence).toEqual(expect.arrayContaining([
      "PUBLISHED_TIER_PRICE",
      "PUBLISHED_TIER_IS_NOT_A_QUOTE",
      "LISTED_MOQ_NOT_AN_ORDER_TERM",
    ]));
    expect(brief.missing).toEqual(expect.arrayContaining([
      "DIOPTERS",
      "MOQ_PER_DIOPTER_COLOR_MODEL",
      "STOCK_OR_PRODUCTION",
      "TRANSPORT",
      "CUSTOMS",
    ]));
    expect(brief.body).toContain("Dear Wenzhou Youge Eyewear Co., Ltd. team,");
    expect(brief.body).toContain("Model: 18107.");
    expect(brief.body).toContain("Quantity: 1,000 pieces.");
    expect(brief.body).toContain("Destination: Serbia.");
    expect(brief.body).toContain("1.1 USD");
    expect(brief.body).toContain("not a written quotation");
    expect(brief.body).toContain("+1.00, +1.50, +2.00, +2.50, +3.00, +3.50");
    expect(brief.body).toContain("MOQ per diopter, per color, and per model.");
    expect(brief.body).toContain("from stock or requires production");
    expect(brief.body).toContain("Incoterm and named place, lead time, packaging, and documents");
    expect(brief.body).toContain("not an order");
    expect(brief.body).not.toContain("We have completed our internal review");
  });

  it("keeps a pasted quotation unconfirmed until the user confirms the supplier price", () => {
    const brief = buildSupplierConfirmationBrief({
      result: glassesOffer(),
      productName: "reading glasses",
      quantity: 1_000,
      destination: "RS",
    });
    const prepared = createPreparedConfirmation();
    expect(markInquirySent(prepared).status).toBe(SupplierConfirmationStatuses.SENT);
    expect(saveSupplierReply(prepared, brief, {
      responseNote: "Supplier replied by email.",
      writtenQuote: "Unit price USD 1.05 for 1000 pcs. MOQ 1200. FOB Ningbo. Lead time 30 days. +1.00 to +3.50 available. Freight USD 400.",
    })).toBe(prepared);

    const sent = markInquirySent(prepared);
    const received = saveSupplierReply(sent, brief, {
      responseNote: "Supplier replied by email.",
      writtenQuote: "Unit price USD 1.05 for 1000 pcs. MOQ 1200. FOB Ningbo. Lead time 30 days. +1.00 to +3.50 available. Freight USD 400.",
    });

    expect(received.status).toBe(SupplierConfirmationStatuses.RESPONSE_RECEIVED);
    expect(received.supplierPriceConfirmed).toBe(false);
    expect(received.proposals.find((item) => item.key === "UNIT_PRICE")).toMatchObject({
      value: "1.05 USD",
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
    expect(received.proposals.some((item) => item.value.includes("400"))).toBe(false);
    expect(received.transportConfirmed).toBe(false);
    expect(received.customsConfirmed).toBe(false);
    expect(received.vatConfirmed).toBe(false);
    expect(received.otherCostsConfirmed).toBe(false);
    expect(received.orderTermsConfirmed).toBe(false);
    expect(received.additionalConfirmationRequired).toBe(true);

    const documented = confirmSupplierTerm(received, brief, "UNIT_PRICE");
    expect(documented.status).toBe(SupplierConfirmationStatuses.DOCUMENTED);
    expect(documented.supplierPriceConfirmed).toBe(true);
    expect(documented.orderTermsConfirmed).toBe(false);
    expect(documented.moqConfirmed).toBe(false);
    expect(documented.transportConfirmed).toBe(false);
    expect(documented.customsConfirmed).toBe(false);
    expect(documented.vatConfirmed).toBe(false);
    expect(documented.otherCostsConfirmed).toBe(false);
    expect(documented.additionalConfirmationRequired).toBe(true);
    expect(documented.proposals.find((item) => item.key === "DIOPTERS")?.confirmed).toBe(false);
    expect(confirmedCalculationInput(documented)).toMatchObject({
      unitPrice: "1.05",
      currency: "USD",
      moq: null,
      transportConfirmed: false,
      customsConfirmed: false,
      vatConfirmed: false,
      otherCostsConfirmed: false,
    });
  });

  it("confirms the complete order only after quantity, MOQ, and diopters are explicitly confirmed", () => {
    const brief = buildSupplierConfirmationBrief({
      result: glassesOffer(),
      productName: "reading glasses",
      quantity: 1_000,
      destination: "RS",
    });
    const received = saveSupplierReply(markInquirySent(createPreparedConfirmation()), brief, {
      responseNote: "Quote attached.",
      writtenQuote: "Unit price USD 1.05 for 1000 pcs. MOQ 100. FOB Ningbo. +1.00 to +3.50 available.",
    });
    const withPrice = confirmSupplierTerm(received, brief, "UNIT_PRICE");
    expect(withPrice.additionalConfirmationRequired).toBe(true);
    expect(withPrice.orderTermsConfirmed).toBe(false);
    const covered = confirmSupplierTerm(withPrice, brief, "DIOPTERS");
    expect(covered.supplierPriceConfirmed).toBe(true);
    expect(covered.variantsConfirmed).toBe(true);
    expect(covered.orderTermsConfirmed).toBe(false);
    expect(covered.additionalConfirmationRequired).toBe(false);
    const withQuantity = confirmSupplierTerm(covered, brief, "ORDER_QUANTITY");
    const complete = confirmSupplierTerm(withQuantity, brief, "MOQ");
    expect(complete.quantityConfirmed).toBe(true);
    expect(complete.moqConfirmed).toBe(true);
    expect(complete.orderTermsConfirmed).toBe(true);
    expect(complete.transportConfirmed).toBe(false);
    expect(complete.vatConfirmed).toBe(false);
    expect(confirmedCalculationInput(complete)?.moq).toBe(100);
  });

  it("does not turn a freight amount into the supplier unit price", () => {
    const brief = buildSupplierConfirmationBrief({
      result: glassesOffer(),
      productName: "reading glasses",
      quantity: 1_000,
      destination: "RS",
    });
    const received = saveSupplierReply(markInquirySent(createPreparedConfirmation()), brief, {
      responseNote: "Freight quoted separately.",
      writtenQuote: "Freight USD 400. Customs USD 90. Unit price USD 1.05 for 1000 pcs. MOQ 100.",
    });

    expect(received.proposals.find((item) => item.key === "UNIT_PRICE")?.value).toBe("1.05 USD");
    expect(received.proposals.some((item) => item.value.includes("400") || item.value.includes("90"))).toBe(false);
    expect(received.transportConfirmed).toBe(false);
    expect(received.customsConfirmed).toBe(false);
    expect(received.supplierPriceConfirmed).toBe(false);
  });

  it("asks for variant terms when the product is not reading glasses", () => {
    const offer = glassesOffer();
    offer.title = "Plastic storage box";
    offer.marketplaceDetails = offer.marketplaceDetails
      ? { ...offer.marketplaceDetails, attributes: [] }
      : null;
    const brief = buildSupplierConfirmationBrief({
      result: offer,
      productName: "kutija za odlaganje",
      quantity: 500,
      destination: "AT",
    });

    expect(brief.readingGlasses).toBe(false);
    expect(brief.destination).toBe("Austria");
    expect(brief.missing).toContain("MOQ_PER_VARIANT");
    expect(brief.missing).not.toContain("DIOPTERS");
    expect(brief.body).toContain("Quantity: 500 pieces.");
    expect(brief.body).toContain("MOQ for the order and per variant.");
    expect(brief.body).not.toContain("+1.00");
  });
});
