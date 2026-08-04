import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
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

describe("profitability check fallback", () => {
  it("uses a native POST form instead of a client-only click handler", () => {
    expect(panelSource).toContain('action={`/api/projects/${projectId}/profitability-check`}');
    expect(panelSource).toContain('method="post"');
    expect(panelSource).not.toContain("onClick={checkProfitability}");
  });

  it("redirects browser form submissions back to the decision step", () => {
    expect(routeSource).toContain("NextResponse.redirect(url, 303)");
    expect(routeSource).toContain('url.hash = "workflow-step-decision"');
  });

  it("reassesses an offer when its latest calculation is newer than its assessment", () => {
    expect(serviceSource).toContain("latestAssessmentCalculationId !== latestCalculationId");
    expect(serviceSource).toContain("await assessSupplierOffer(offer.id, organizationId)");
    expect(serviceSource).toContain("return generateProjectDecision(projectId, organizationId)");
  });
});
