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
const profitabilityControlSource = readFileSync(
  join(process.cwd(), "components/projects/profitability-check-control.tsx"),
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
  it("bounds authentication and profitability work on the server", () => {
    expect(profitabilityRouteSource).toContain("PROFITABILITY_CHECK_TIMEOUT_MS = 14_000");
    expect(profitabilityRouteSource).toContain("Promise.race");
    expect(profitabilityRouteSource).toContain("runProfitabilityRequest(request, projectId)");
    expect(profitabilityRouteSource).toContain("await authenticateRequest(request)");
    expect(profitabilityRouteSource).toContain("ProfitabilityCheckTimeoutError");
    expect(profitabilityRouteSource).toContain('"CHECK_TIMEOUT"');
  });

  it("stops the visible client lifecycle even if the server never responds", () => {
    expect(profitabilityControlSource).toContain("PROFITABILITY_CLIENT_TIMEOUT_MS = 18_000");
    expect(profitabilityControlSource).toContain("controller.abort");
    expect(profitabilityControlSource).toContain("setPending(false)");
    expect(profitabilityControlSource).toContain("pendingRef.current = false");
    expect(profitabilityControlSource).toContain("aria-busy={pending}");
  });
});
