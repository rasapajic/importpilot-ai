import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PROJECTS_LIST_ROUTE,
  ProjectBackLink,
} from "../../components/projects/project-back-link";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("project detail back navigation", () => {
  it("renders Nazad na projekte and links to the projects dashboard", () => {
    const html = renderToStaticMarkup(<ProjectBackLink label="Nazad na projekte" />);
    expect(html).toContain("Nazad na projekte");
    expect(html).toContain(`href="${PROJECTS_LIST_ROUTE}"`);
    expect(PROJECTS_LIST_ROUTE).toBe("/dashboard");
  });

  it("keeps the mobile back link outside the header hit area", () => {
    expect(css).toContain("padding-top: 8.25rem");
    expect(css).toContain(".dashboard-shell > nav:first-child");
    expect(css).toContain("z-index: 20");
    expect(css).toContain("touch-action: manipulation");
  });
});
