import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "app/(dashboard)/dashboard/page.tsx"),
  "utf8",
);

describe("simple client dashboard", () => {
  it("keeps only the primary actions and useful project facts", () => {
    expect(source).toContain("DashboardPrimaryActions");
    expect(source).toContain("getCountryDisplayName");
    expect(source).toContain("projectStage(project)");
    expect(source).toContain("project.quantity");
  });

  it("does not expose analytics or destructive demo controls", () => {
    expect(source).not.toContain("getOrganizationAnalytics");
    expect(source).not.toContain("analytics-card");
    expect(source).not.toContain("Pokazatelji tačnosti preporuka");
    expect(source).not.toContain("DeleteDemoProjectButton");
    expect(source).not.toContain("Obriši projekat");
  });

  it("does not clutter project cards with document counters", () => {
    expect(source).not.toContain("documentLabel");
    expect(source).not.toContain("project._count.files");
  });
});
