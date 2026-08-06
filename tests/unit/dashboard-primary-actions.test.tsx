import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const intakeSource = readFileSync(
  join(process.cwd(), "components/dashboard/dashboard-primary-actions.tsx"),
  "utf8",
);
const dashboardSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/dashboard/page.tsx"),
  "utf8",
);
const newProjectSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/new/page.tsx"),
  "utf8",
);

describe("unified dashboard product intake", () => {
  it("keeps text, image and link in one intake", () => {
    expect(intakeSource).toContain("Opišite proizvod");
    expect(intakeSource).toContain("Dodajte sliku");
    expect(intakeSource).toContain("Nalepite link");
    expect(intakeSource).toContain("Podesite pretragu");
    expect(intakeSource).toContain('type="file"');
    expect(intakeSource).toContain('type="url"');
  });

  it("asks for business details only in the second step", () => {
    expect(intakeSource).toContain('step === "product"');
    expect(intakeSource).toContain("Još samo osnovni podaci");
    expect(intakeSource).toContain('name="targetCountry"');
    expect(intakeSource).toContain('name="quantity"');
    expect(intakeSource).toContain('name="targetMargin"');
  });

  it("keeps saved searches beside the new demand on desktop", () => {
    expect(dashboardSource).toContain("demandColumn");
    expect(dashboardSource).toContain("searchesColumn");
    expect(dashboardSource).toContain("Moje pretrage");
  });

  it("prefills the existing robust URL flow", () => {
    expect(intakeSource).toContain('params.set("description", cleanDescription)');
    expect(intakeSource).toContain("productUrl: cleanUrl");
    expect(newProjectSource).toContain("initialProductUrl={initialProductUrl}");
    expect(newProjectSource).toContain("initialProductName={initialDescription}");
  });
});
