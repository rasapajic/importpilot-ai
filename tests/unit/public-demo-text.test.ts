import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  containsInternalAcceptanceText,
  publicOfferTitle,
  publicProjectName,
} from "../../modules/projects/domain/public-demo-text";

describe("public demo text", () => {
  it("removes internal acceptance labels from product and project names", () => {
    expect(publicProjectName("JAKOV360 Acceptance pregled — Zaštitne naočare")).toBe("Zaštitne naočare");
    expect(publicOfferTitle("Zaštitne naočare — JAKOV360 acceptance primer")).toBe("Zaštitne naočare");
  });

  it("detects internal fixture descriptions before timeline rendering", () => {
    expect(containsInternalAcceptanceText("Lokalni acceptance projekat")).toBe(true);
    expect(containsInternalAcceptanceText("Ponuda je analizirana")).toBe(false);
  });

  it("sanitizes project names on the dashboard", () => {
    const dashboard = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/page.tsx"), "utf8");
    expect(dashboard).toContain("publicProjectName(project.name)");
  });
});
