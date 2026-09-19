import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
  "utf8",
);

describe("ImportPilot 1.0 profitability display confidence", () => {
  it("uses the fresh FX endpoint and never falls back to the stale reference snapshot for non-EUR display", () => {
    expect(source).toContain('fetch("/api/fx/latest"');
    expect(source).toContain('currency !== "EUR" && !fxSnapshot');
    expect(source).toContain("getEuroDisplay(numeric, currency, fxSnapshot ?? undefined)");
  });

  it("shows a preliminary estimate when price is known but Incoterm is missing", () => {
    expect(source).toContain("preliminarySearchResult");
    expect(source).toContain("estimateTajaPreliminaryLandedCost");
    expect(source).toContain('preliminaryEstimateTitle: "Preliminarna procena uvoza"');
    expect(source).toContain('assumedIncoterm: "EXW — pretpostavka za procenu"');
    expect(source).toContain("preliminaryEstimate.deliveryTimeDays");
    expect(source).toContain("pricingBasisAssumed");
    expect(source).toContain("Potvrdite stvarni Incoterm");
  });

  it("labels unconfirmed transport or customs costs as estimates", () => {
    expect(source).toContain("!assumptions.transportConfirmed || !assumptions.customsDutyConfirmed");
    expect(source).toContain('estimatedCostPerUnit: "Procenjena cena po komadu"');
    expect(source).toContain('estimatedTotalCost: "Procenjena ukupna nabavna cena"');
    expect(source).toContain("costNeedsReview");
    expect(source).toContain("zahteva proveru pre kupovine");
  });
});
