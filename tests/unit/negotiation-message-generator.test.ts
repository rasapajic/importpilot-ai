import { describe, expect, it } from "vitest";

import {
  deriveNegotiationRequests,
  generateNegotiationMessage,
  NegotiationRequests,
  NegotiationTones,
  type NegotiationFacts,
} from "../../modules/negotiation/domain/message-generator";

const baseFacts: NegotiationFacts = {
  supplierName: "Example Supplier",
  projectName: "smart storage organizers",
  projectQuantity: 100,
  projectDecisionStatus: "NEGOTIATE_FIRST",
  recommendationStatus: "OK_WITH_RISK",
  currency: "USD",
  unitPrice: 2.5,
  moq: null,
  incoterm: "EXW",
  landedCostPerUnit: 6.27,
  supplierRiskScore: 45,
  overallScore: 70,
};

describe("negotiation message generator", () => {
  it("requests MOQ confirmation when the saved offer has no MOQ", () => {
    const requests = deriveNegotiationRequests(
      ["REQUEST_SAMPLE", "CONFIRM_SHIPPING"],
      "NEGOTIATE_FIRST",
      baseFacts,
    );

    expect(requests).toContain(NegotiationRequests.LOWER_MOQ);
  });

  it("does not add an MOQ request solely because facts are supplied when MOQ is known", () => {
    const requests = deriveNegotiationRequests(
      ["REQUEST_SAMPLE"],
      "NEGOTIATE_FIRST",
      { moq: 100 },
    );

    expect(requests).not.toContain(NegotiationRequests.LOWER_MOQ);
  });

  it("includes planned quantity and complete packing data in a formal draft", () => {
    const draft = generateNegotiationMessage(
      NegotiationTones.FORMAL,
      baseFacts,
      [
        NegotiationRequests.LOWER_MOQ,
        NegotiationRequests.CONFIRM_SHIPPING,
        NegotiationRequests.FINAL_PROFORMA_INVOICE,
      ],
    );

    expect(draft.body).toContain("confirm your MOQ");
    expect(draft.body).toContain("100 units");
    expect(draft.body).toContain("units per carton");
    expect(draft.body).toContain("carton dimensions");
    expect(draft.body).toContain("gross and net weight per carton");
    expect(draft.body).toContain("total number of cartons");
    expect(draft.body).toContain("total CBM");
    expect(draft.body).toContain("confirmed MOQ");
    expect(draft.body).toContain("packing details");
  });

  it("asks to reduce a known blocking MOQ to the planned quantity", () => {
    const draft = generateNegotiationMessage(
      NegotiationTones.DIRECT,
      { ...baseFacts, moq: 500 },
      [NegotiationRequests.LOWER_MOQ],
    );

    expect(draft.body).toContain("MOQ of 500 units");
    expect(draft.body).toContain("planned quantity of 100 units");
  });
});
