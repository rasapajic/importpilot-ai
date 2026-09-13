import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/costs/cost-calculator-form.tsx"),
  "utf8",
);

describe("ImportPilot 1.0 profitability entry", () => {
  it("keeps the user selling price as the primary visible input", () => {
    const sellingPrice = source.indexOf('name="targetSellingPrice"');
    const importCostDetails = source.indexOf("Proverite i potvrdite uvozne troškove");

    expect(sellingPrice).toBeGreaterThan(-1);
    expect(importCostDetails).toBeGreaterThan(-1);
    expect(sellingPrice).toBeLessThan(importCostDetails);
  });

  it("puts technical import inputs behind progressive disclosure", () => {
    expect(source).toContain('<details className="advanced-costs cost-form-wide" open={editInitially}>');
    expect(source).toContain("TransportCostAssistant");
    expect(source).toContain('name="customsDutyRate"');
    expect(source).toContain('name="vatRate"');
  });

  it("still requires explicit import-cost review instead of silently treating unknown costs as free", () => {
    const summary = source.indexOf("Proverite i potvrdite uvozne troškove");
    const submit = source.indexOf('type="submit"');

    expect(summary).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(summary);
  });
});
