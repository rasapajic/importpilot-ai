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
const decisionServiceSource = readFileSync(
  join(process.cwd(), "modules/decisions/application/project-decision-service.ts"),
  "utf8",
);

describe("profitability check lifecycle", () => {
  it("uses a bounded client request while retaining a native POST fallback", () => {
    expect(panelSource).toContain("ProfitabilityCheckControl");
    expect(controlSource).toContain("const actionUrl = focusedOfferId");
    expect(controlSource).toContain("action={actionUrl}");
    expect(controlSource).toContain('method="post"');
    expect(controlSource).toContain("onSubmit={submit}");
    expect(controlSource).toContain("event.preventDefault()");
    expect(controlSource).toContain("AbortController");
    expect(controlSource).toContain("PROFITABILITY_CLIENT_TIMEOUT_MS = 18_000");
    expect(controlSource).toContain("pendingRef.current");
    expect(controlSource).toContain("readApiJson");
  });

  it("carries the selected offer through client and no-JavaScript profitability requests", () => {
    expect(controlSource).toContain('searchParams.get("selectedOffer")');
    expect(controlSource).toContain("profitability-check?offerId=${encodeURIComponent(focusedOfferId)}");
    expect(routeSource).toContain('request.nextUrl.searchParams.get("offerId")');
    expect(routeSource).toContain("runProfitabilityRequest(request, projectId, offerId)");
    expect(routeSource).toContain('url.searchParams.set("selectedOffer", offerId)');
  });

  it("redirects no-JavaScript form submissions back to the focused decision step", () => {
    expect(routeSource).toContain("NextResponse.redirect(url, 303)");
    expect(routeSource).toContain('url.hash = "workflow-step-decision"');
  });

  it("reassesses only the selected offer when its calculation is newer", () => {
    expect(serviceSource).toContain("offerId?: string");
    expect(serviceSource).toContain("where: offerId ? { id: offerId } : undefined");
    expect(serviceSource).toContain("latestAssessmentCalculationId !== latestCalculationId");
    expect(serviceSource).toContain("await assessSupplierOffer(offer.id, organizationId)");
    expect(serviceSource).toContain("return generateProjectDecision(projectId, organizationId, offerId)");
  });

  it("generates a decision from the same focused offer set", () => {
    expect(decisionServiceSource).toContain("offerId?: string");
    expect(decisionServiceSource).toContain("where: offerId ? { id: offerId } : undefined");
    expect(decisionServiceSource).toContain("focusedOfferId: offerId");
  });
});