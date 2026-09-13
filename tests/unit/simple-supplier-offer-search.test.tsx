import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const resultsSource = readFileSync(
  join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"),
  "utf8",
);
const projectSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);

describe("ImportPilot 1.0 simple supplier results", () => {
  it("keeps the main result card focused on the buying decision", () => {
    expect(resultsSource).toContain("Najbolje ponude");
    expect(resultsSource).toContain("Cena dobavljača");
    expect(resultsSource).toContain("Landed cost");
    expect(resultsSource).toContain("Dobavljač");
    expect(resultsSource).toContain("Izaberi ponudu");
    expect(resultsSource).toContain("Detalji analize");
  });

  it("maps deep analysis to the simple 1.0 decision vocabulary", () => {
    expect(resultsSource).toContain('return "BUY" as const');
    expect(resultsSource).toContain('return "NEGOTIATE" as const');
    expect(resultsSource).toContain('return "SKIP" as const');
    expect(resultsSource).toContain('return "WATCH" as const');
  });

  it("does not expose advanced search criteria in the simple results component", () => {
    expect(resultsSource).not.toContain("targetMarginPercent");
    expect(resultsSource).not.toContain("privateLabel: true");
    expect(resultsSource).not.toContain("maxUnitPrice");
    expect(resultsSource).not.toContain("preparedQueries");
  });

  it("uses the simple results screen in the normal project flow and keeps legacy URL import isolated", () => {
    expect(projectSource).toContain("<SimpleSupplierOfferSearch");
    expect(projectSource).toContain("legacyUrlImport ?");
    expect(projectSource).not.toContain('🎯 {t("Marža")}');
    expect(projectSource).not.toContain('t("Ciljna marža")');
  });
});
