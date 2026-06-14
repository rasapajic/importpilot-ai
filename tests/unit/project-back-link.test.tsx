import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PROJECTS_LIST_ROUTE,
  ProjectBackLink,
} from "../../components/projects/project-back-link";

describe("project detail back navigation", () => {
  it("renders Nazad na projekte and links to the projects dashboard", () => {
    const html = renderToStaticMarkup(<ProjectBackLink label="Nazad na projekte" />);
    expect(html).toContain("Nazad na projekte");
    expect(html).toContain(`href="${PROJECTS_LIST_ROUTE}"`);
    expect(PROJECTS_LIST_ROUTE).toBe("/dashboard");
  });
});
