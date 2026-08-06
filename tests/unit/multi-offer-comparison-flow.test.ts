import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getLunaSearchCopy } from "../../components/search/luna-search-copy";

const searchSource = readFileSync(
  join(process.cwd(), "components/search/supplier-offer-search.tsx"),
  "utf8",
);
const workflowSource = readFileSync(
  join(process.cwd(), "components/projects/project-workflow-step.tsx"),
  "utf8",
);

describe("multi-offer comparison flow", () => {
  it("uses comparison language in all supported locales", () => {
    expect(getLunaSearchCopy("sr").addToComparison).toBe("Dodaj u poređenje");
    expect(getLunaSearchCopy("de").addToComparison).toBe("Zum Vergleich hinzufügen");
    expect(getLunaSearchCopy("en").addToComparison).toBe("Add to comparison");
    expect(getLunaSearchCopy("sr").continueWithSelected(3))
      .toBe("Nastavite sa izabranim ponudama (3)");
  });

  it("keeps result selection separate from the explicit next-step action", () => {
    expect(searchSource).toContain("lunaCopy.addToComparison");
    expect(searchSource).toContain("lunaCopy.addedToComparison");
    expect(searchSource).toContain("lunaCopy.continueWithSelected(imported.length)");
    expect(searchSource).toContain("function continueToDecision()");
    expect(searchSource).toContain('document.getElementById("workflow-step-decision")');
  });

  it("keeps an open workflow step controlled by preserved client state", () => {
    expect(workflowSource).toContain("resolveWorkflowStepOpenState");
    expect(workflowSource).toContain("shouldAutoScrollWorkflowStep");
    expect(workflowSource).toContain("open={isOpen}");
    expect(workflowSource).not.toContain('open={status === "ACTIVE" || forceOpen}');
  });
});
