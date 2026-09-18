import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Serbian core UI localization", () => {
  it("does not expose English landed-cost wording in Serbian supplier UI copy", () => {
    const simple = source("components/search/simple-supplier-offer-search.tsx");
    const advanced = source("components/search/supplier-offer-search.tsx");
    const preview = source("components/search/taja-preview-business-summary.tsx");

    expect(simple).toContain('landedCost: "Ukupni trošak uvoza"');
    expect(advanced).toContain('landedCostLabel: "Ukupni trošak uvoza"');
    expect(advanced).toContain('LANDED_COST: "potvrđen ukupni trošak uvoza"');
    expect(preview).toContain('landedCost: "Ukupni trošak uvoza"');
  });

  it("localizes visible decision labels in Serbian while keeping internal statuses unchanged", () => {
    const simple = source("components/search/simple-supplier-offer-search.tsx");
    const decisions = source("modules/decisions/application/decision-step-summary.ts");

    expect(simple).toContain('BUY: "KUPI"');
    expect(simple).toContain('NEGOTIATE: "PREGOVARAJ"');
    expect(simple).toContain('WATCH: "PRATI"');
    expect(simple).toContain('SKIP: "PRESKOČI"');
    expect(decisions).toContain('sr: { title: "KUPI"');
    expect(decisions).toContain('sr: { title: "PREGOVARAJ"');
    expect(decisions).toContain('sr: { title: "PRATI"');
    expect(decisions).toContain('sr: { title: "PRESKOČI"');
  });
});
