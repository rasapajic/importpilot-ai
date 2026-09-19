import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("JAKOV360 mobile project workflow", () => {
  const css = source("app/globals.css");
  const workflow = source("components/projects/project-workflow-step.tsx");
  const results = source("components/search/simple-supplier-offer-search.tsx");

  it("renders workflow steps as structured cards instead of concatenated inline text", () => {
    expect(workflow).toContain('className="workflow-step-summary"');
    expect(css).toContain(".project-workflow {");
    expect(css).toContain(".workflow-step-summary {");
    expect(css).toContain("grid-template-columns: 2.25rem minmax(0, 1fr) auto");
    expect(css).toContain("details.workflow-step > summary::-webkit-details-marker");
  });

  it("stacks number, heading and badge cleanly on phones", () => {
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("grid-template-columns: 2rem minmax(0, 1fr)");
    expect(css).toContain("grid-row: 1 / span 2");
    expect(css).toContain("grid-column: 2");
  });

  it("keeps project titles and content phone-sized", () => {
    expect(css).toContain(".dashboard-header h1 {");
    expect(css).toContain("font-size: clamp(2rem, 8.5vw, 2.7rem)");
    expect(css).toContain(".dashboard-card {");
  });

  it("uses the JAKOV360 brand in the visible supplier flow", () => {
    expect(results).toContain("JAKOV360 je izdvojio");
    expect(results).toContain("JAKOV360 neće prikazati");
    expect(results).not.toContain("ImportPilot je izdvojio");
    expect(results).not.toContain("ImportPilot neće prikazati");
  });
});
