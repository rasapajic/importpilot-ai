import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("manual acceptance UI guards", () => {
  it("marks a selected transport estimate as unsaved until the calculation form is submitted", () => {
    const assistant = source("components/costs/transport-cost-assistant.tsx");
    expect(assistant).toContain("selectionPendingSave");
    expect(assistant).toContain("Izbor još nije sačuvan. Kliknite „Izračunaj i sačuvaj“.");
  });

  it("controls and disables official customs confirmation until all evidence is valid", () => {
    const calculator = source("components/costs/cost-calculator-form.tsx");
    expect(calculator).toContain("checked={customsConfirmed}");
    expect(calculator).toContain("disabled={!canConfirmCustoms}");
    expect(calculator).toContain("setCustomsConfirmed(false)");
    expect(calculator).not.toContain("defaultChecked={customsProvenance.confirmedByOfficialSource === true}");
  });

  it("does not render precise scores when assessment reliability is insufficient", () => {
    const panel = source("components/intelligence/assessment-panel.tsx");
    expect(panel).toContain("detailedScoresReliable ?");
    expect(panel).toContain("Nije moguće pouzdano oceniti");
    expect(panel).toContain("confidenceLabel");
  });
});
