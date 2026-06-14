import { describe, expect, it } from "vitest";

import { dashboardPrimaryActions } from "../../modules/dashboard/primary-actions";
import { getProjectCreationDestination } from "../../modules/projects/application/project-creation-destination";
import { translateText } from "../../modules/i18n/translations";

describe("dashboard primary actions", () => {
  it("renders search and URL import entry points", () => {
    expect(dashboardPrimaryActions.map((action) => action.label)).toEqual([
      "New search",
      "Paste product link",
    ]);
    expect(dashboardPrimaryActions.map((action) => action.href)).toEqual([
      "/projects/new",
      "/projects/new?mode=url",
    ]);
  });

  it("opens URL import after creating a project from the link flow", () => {
    expect(getProjectCreationDestination("project-1", "url"))
      .toBe("/projects/project-1?importUrl=1#workflow-step-offer");
    expect(getProjectCreationDestination("project-1", "search")).toBe("/projects/project-1");
  });

  it("keeps search and URL import entry experiences different", () => {
    expect(dashboardPrimaryActions[0].href).not.toBe(dashboardPrimaryActions[1].href);
    expect(translateText("Nova pretraga", "en")).toBe("New search");
    expect(translateText("Ubaci link proizvoda", "en")).toBe("Paste product link");
    expect(translateText("Kreiraj pretragu", "en")).toBe("Create search");
    expect(getProjectCreationDestination("project-1", "url")).toContain("importUrl=1");
  });
});
