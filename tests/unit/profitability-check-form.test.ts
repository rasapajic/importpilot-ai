import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
  "utf8",
);
const controlSource = readFileSync(
  join(process.cwd(), "components/projects/profitability-check-control.tsx"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/profitability-check/route.ts"),
  "utf8",
);
const serviceSource = readFileSync(
  join(process.cwd(), "modules/projects/application/profitability-check-service.ts"),
  "utf8",
);

describe("profitability check lifecycle", () => {
  it("uses a bounded client request while retaining a native POST fallback", () => {
    expect(panelSource).toContain("ProfitabilityCheckControl");
    expect(controlSource).toContain('action={`/api/projects/${projectId}/profitability-check`}');
    expect(controlSource).toContain('method="post"');
    expect(controlSource).toContain("onSubmit={submit}");
    expect(controlSource).toContain("event.preventDefault()");
    expect(controlSource).toContain("AbortController");
    expect(controlSource).toContain("PROFITABILITY_CLIENT_TIMEOUT_MS = 18_000");
    expect(controlSource).toContain("pendingRef.current");
    expect(controlSource).toContain("readApiJson");
  });

  it("redirects no-JavaScript form submissions back to the decision step", () => {
    expect(routeSource).toContain("NextResponse.redirect(url, 303)");
    expect(routeSource).toContain('url.hash = "workflow-step-decision"');
  });

  it("reassesses an offer when its latest calculation is newer than its assessment", () => {
    expect(serviceSource).toContain("latestAssessmentCalculationId !== latestCalculationId");
    expect(serviceSource).toContain("await assessSupplierOffer(offer.id, organizationId)");
    expect(serviceSource).toContain("return generateProjectDecision(projectId, organizationId)");
  });
});
