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
const dashboardCss = readFileSync(
  join(process.cwd(), "app/(dashboard)/dashboard/dashboard.module.css"),
  "utf8",
);
const layoutSource = readFileSync(
  join(process.cwd(), "app/layout.tsx"),
  "utf8",
);

describe("ImportPilot 1.0 core search intake", () => {
  it("asks only for product, quantity and destination", () => {
    expect(intakeSource).toContain('name="name"');
    expect(intakeSource).toContain('name="quantity"');
    expect(intakeSource).toContain('name="targetCountry"');
    expect(intakeSource).toContain("Pronađi najbolje ponude");
    expect(intakeSource).not.toContain('name="targetMargin"');
    expect(intakeSource).not.toContain('type="file"');
    expect(intakeSource).not.toContain('type="url"');
  });

  it("starts supplier search immediately after creation", () => {
    expect(intakeSource).toContain('getProjectCreationDestination(project.id, "search")');
    expect(intakeSource).not.toContain("targetMargin: form.get");
  });

  it("keeps saved searches beside the new demand on desktop", () => {
    expect(dashboardSource).toContain("demandColumn");
    expect(dashboardSource).toContain("searchesColumn");
    expect(dashboardSource).toContain("Moje pretrage");
    expect(dashboardSource).toContain("Unesite proizvod, količinu i destinaciju");
  });

  it("stacks saved searches below the intake on mobile with a real device viewport", () => {
    expect(layoutSource).toContain('width: "device-width"');
    expect(layoutSource).toContain("initialScale: 1");
    expect(dashboardCss).toContain("@media (max-width: 920px)");
    expect(dashboardCss).toContain(".demandColumn {");
    expect(dashboardCss).toContain("order: 1");
    expect(dashboardCss).toContain(".searchesColumn {");
    expect(dashboardCss).toContain("order: 2");
  });

  it("uses JAKOV360 public copy on the dashboard", () => {
    expect(dashboardSource).toContain("JAKOV360 radi ostalo.");
    expect(dashboardSource).not.toContain("ImportPilot radi ostalo.");
  });

  it("uses the same simple search intake on the new-search page", () => {
    expect(newProjectSource).toContain("<DashboardPrimaryActions />");
    expect(newProjectSource).toContain("proizvod, količinu i destinaciju");
  });
});
