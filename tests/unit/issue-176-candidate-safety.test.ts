import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canPresentBestChoice,
  evaluateExplicitProductConstraints,
  explicitProductConstraintRank,
} from "../../modules/product-search/domain/explicit-product-constraints";

const source = readFileSync(join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"), "utf8");
const fixedRequest = "naočare za čitanje +1 do +3,5 dioptrija, fiksne dioptrije, nisu progresivne";
function listing(title: string) {
  return { title, marketplaceDetails: null };
}

describe("Issue #176 reuse of PR #177 — safe supplier choice", () => {
  it("disqualifies multifocal adjustable +4.00 for a fixed +1 to +3.5 request", () => {
    const x = evaluateExplicitProductConstraints(fixedRequest, listing(
      "Adjustable +4.00 Progressive Multifocal Reading Glasses",
    ));
    expect(x.status).toBe("DISQUALIFIED");
    expect(x.reasons).toContain("PROGRESSIVE_OR_ADJUSTABLE_LENS");
    expect(x.reasons).toContain("DIOPTER_OUTSIDE_REQUEST");
    expect(canPresentBestChoice({ status: x.status, finalEligible: true, confidenceScore: 100 })).toBe(false);
  });

  it("does not assume generic reading glasses have confirmed fixed lenses", () => {
    const x = evaluateExplicitProductConstraints(fixedRequest, listing("Wholesale Reading Glasses"));
    expect(x.status).toBe("NEEDS_CONFIRMATION");
    expect(canPresentBestChoice({ status: x.status, finalEligible: true, confidenceScore: 100 })).toBe(false);
  });

  it("requires final eligibility and confidence for an explicitly compatible product", () => {
    const x = evaluateExplicitProductConstraints(
      fixedRequest, listing("Single vision fixed diopter reading glasses +1.00 +2.50 +3.50"),
    );
    expect(x.status).toBe("COMPATIBLE");
    expect(canPresentBestChoice({ status: x.status, finalEligible: false, confidenceScore: 99 })).toBe(false);
    expect(canPresentBestChoice({ status: x.status, finalEligible: true, confidenceScore: 24 })).toBe(false);
    expect(canPresentBestChoice({ status: x.status, finalEligible: true, confidenceScore: 80 })).toBe(true);
  });

  it("keeps hard mismatches below eligible and unconfirmed items in preliminary ranking", () => {
    expect(explicitProductConstraintRank("COMPATIBLE")).toBeLessThan(
      explicitProductConstraintRank("NEEDS_CONFIRMATION"),
    );
    expect(explicitProductConstraintRank("NEEDS_CONFIRMATION")).toBeLessThan(
      explicitProductConstraintRank("DISQUALIFIED"),
    );
  });

  it("does not treat advertised prices or position zero as confirmation", () => {
    expect(source).toContain("const bestChoiceUrl = visible.find");
    expect(source).toContain("canPresentBestChoice({");
    expect(source).toContain('analysis?.status === "FINAL" && analysis.finalEligible');
    expect(source).toContain('const isBestChoice = bestChoiceUrl === result.productUrl');
    expect(source).toContain('constraint.status === "DISQUALIFIED" ? "SKIP"');
    expect(source).toContain('constraint.status === "NEEDS_CONFIRMATION" ? "WATCH"');
    expect(source).toContain('selectionReasons(result, analysis, quantity, text, constraint.status)');
    expect(source).not.toContain('index === 0 && <span className="best-choice-badge">');
    expect(source).not.toContain('index === 0 ? " search-result-card-best"');
    expect(source).toContain("presentSupplierOfferPrice(result, quantity)");
  });
});
