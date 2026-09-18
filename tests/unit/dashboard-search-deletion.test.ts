import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dashboard search deletion", () => {
  const dashboard = source("app/(dashboard)/dashboard/page.tsx");
  const button = source("components/projects/delete-search-button.tsx");
  const route = source("app/api/projects/[projectId]/route.ts");

  it("shows a delete control for every dashboard search card", () => {
    expect(dashboard).toContain("DeleteSearchButton");
    expect(dashboard).toContain("projectId={project.id}");
    expect(dashboard).toContain("projectName={project.name}");
  });

  it("requires confirmation and uses the full-search delete API mode", () => {
    expect(button).toContain("showModal()");
    expect(button).toContain("?mode=search");
    expect(button).toContain("trajno obrisana");
    expect(route).toContain('mode === "search"');
    expect(route).toContain("deleteSearchProject");
  });
});
