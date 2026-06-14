import { describe, expect, it } from "vitest";

import {
  deriveNegotiationRequests,
  generateNegotiationMessage,
  NegotiationRequests,
  NegotiationTones,
  type NegotiationFacts,
} from "../../modules/negotiation/domain/message-generator";

const facts: NegotiationFacts = {
  supplierName: "Shenzhen Supply",
  projectName: "Electric Kettles",
  projectQuantity: 500,
  projectDecisionStatus: "NEGOTIATE_FIRST",
  recommendationStatus: "OK_WITH_RISK",
  currency: "EUR",
  unitPrice: 12.5,
  moq: 1000,
  incoterm: "FOB",
  landedCostPerUnit: 17.25,
  supplierRiskScore: 32,
  overallScore: 74,
};

describe("negotiation message generator", () => {
  it("derives checklist requests and always requests a final PI", () => {
    expect(
      deriveNegotiationRequests(
        ["REQUEST_SAMPLE", "CONFIRM_INCOTERM", "CONFIRM_SHIPPING", "NEGOTIATE_MOQ"],
        "NEGOTIATE_FIRST",
      ),
    ).toEqual([
      NegotiationRequests.REQUEST_SAMPLE,
      NegotiationRequests.CONFIRM_INCOTERM,
      NegotiationRequests.CONFIRM_SHIPPING,
      NegotiationRequests.LOWER_MOQ,
      NegotiationRequests.BETTER_PRICE,
      NegotiationRequests.FINAL_PROFORMA_INVOICE,
    ]);
  });

  it("does not request a better price for a ready-to-buy decision", () => {
    const requests = deriveNegotiationRequests([], "READY_TO_BUY");
    expect(requests).toEqual([NegotiationRequests.FINAL_PROFORMA_INVOICE]);
  });

  it.each(Object.values(NegotiationTones))(
    "keeps locked facts and requests unchanged for %s tone",
    (tone) => {
      const requests = [
        NegotiationRequests.LOWER_MOQ,
        NegotiationRequests.BETTER_PRICE,
        NegotiationRequests.CONFIRM_INCOTERM,
      ];
      const draft = generateNegotiationMessage(tone, facts, requests);

      expect(draft.lockedFacts).toBe(facts);
      expect(draft.requestTypes).toEqual(requests);
      expect(draft.body).toContain("500 units");
      expect(draft.body).toContain("12.5 EUR");
      expect(draft.body).toContain("FOB");
    },
  );

  it("does not invent target price or Incoterm when facts are missing", () => {
    const draft = generateNegotiationMessage(
      NegotiationTones.DIRECT,
      { ...facts, unitPrice: null, currency: null, moq: null, incoterm: null },
      [
        NegotiationRequests.BETTER_PRICE,
        NegotiationRequests.CONFIRM_INCOTERM,
      ],
    );

    expect(draft.body).toContain("Please provide your best revised unit price.");
    expect(draft.body).toContain("Please confirm the applicable Incoterm");
    expect(draft.body).not.toMatch(/\b\d+(?:\.\d+)?\s[A-Z]{3}\b/);
  });
});
