import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflowStepSource = readFileSync(
  join(process.cwd(), "components/projects/project-workflow-step.tsx"),
  "utf8",
);
const profitabilityRouteSource = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/profitability-check/route.ts"),
  "utf8",
);

describe("workflow navigation priority", () => {
  it("opens and focuses the step explicitly selected by the URL hash", () => {
    expect(workflowStepSource).toContain("const explicitHash = window.location.hash");
    expect(workflowStepSource).toContain("if (explicitHash !== currentHash) return");
    expect(workflowStepSource).toContain("stepRef.current.open = true");
    expect(workflowStepSource).toContain("scrollIntoView({ block: \"start\" })");
  });

  it("does not let another active step steal an explicit hash target", () => {
    expect(workflowStepSource.indexOf("if (explicitHash && currentHash)"))
      .toBeLessThan(workflowStepSource.indexOf('status === "ACTIVE"'));
  });
});

describe("profitability check timeout", () => {
  it("bounds a profitability request instead of leaving the browser waiting indefinitely", () => {
    expect(profitabilityRouteSource).toContain("PROFITABILITY_CHECK_TIMEOUT_MS = 15_000");
    expect(profitabilityRouteSource).toContain("Promise.race");
    expect(profitabilityRouteSource).toContain("ProfitabilityCheckTimeoutError");
    expect(profitabilityRouteSource).toContain('"CHECK_TIMEOUT"');
  });
});
