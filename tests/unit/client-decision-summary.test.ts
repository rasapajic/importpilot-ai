import { describe, expect, it } from "vitest";

import { getClientDecisionSummary } from "../../modules/decisions/application/client-decision-summary";

describe("client decision summary", () => {
  it("keeps supplier names unchanged in Serbian", () => {
    const result = getClientDecisionSummary({
      locale: "sr",
      offerCount: 1,
      supplierName: "Shenzhen Smart Storage Factory",
      overallScore: 93,
    });

    expect(result).toContain("Shenzhen Smart Storage Factory");
    expect(result).not.toContain("Smart Skladištenje");
    expect(result).toContain("Analizirano: 1 ponuda");
    expect(result).toContain("uporedite još 2 ponude");
  });

  it("uses correct Serbian offer forms", () => {
    expect(getClientDecisionSummary({ locale: "sr", offerCount: 2, supplierName: "A", overallScore: null }))
      .toContain("Analizirano: 2 ponude");
    expect(getClientDecisionSummary({ locale: "sr", offerCount: 5, supplierName: "A", overallScore: null }))
      .toContain("Analizirano: 5 ponuda");
  });

  it("creates concise German and English summaries", () => {
    expect(getClientDecisionSummary({ locale: "de", offerCount: 1, supplierName: "Factory GmbH", overallScore: 88 }))
      .toContain("Analysiert: 1 Angebot");
    expect(getClientDecisionSummary({ locale: "en", offerCount: 3, supplierName: "Factory Ltd", overallScore: 90 }))
      .toBe("Analysed: 3 offers. Best offer: Factory Ltd (90/100).");
  });
});
