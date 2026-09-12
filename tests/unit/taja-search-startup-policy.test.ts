import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getLunaSearchCopy } from "../../components/search/luna-search-copy";
import { getProjectCreationDestination } from "../../modules/projects/application/project-creation-destination";

const supplierSearchSource = readFileSync(
  join(process.cwd(), "components/search/supplier-offer-search.tsx"),
  "utf8",
);
const projectPageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);
const productSearchServiceSource = readFileSync(
  join(process.cwd(), "modules/product-search/application/product-search-service.ts"),
  "utf8",
);

describe("TAJA search startup policy", () => {
  it("marks only a newly created standard search for one automatic live run", () => {
    expect(getProjectCreationDestination("project-1", "search")).toBe(
      "/projects/project-1?autoSearch=1#workflow-step-offer",
    );
    expect(getProjectCreationDestination("project-1", "url")).toBe(
      "/projects/project-1?importUrl=1#workflow-step-offer",
    );
  });

  it("does not run a paid search merely because an existing project was opened", () => {
    expect(projectPageSource).toContain('resolvedSearchParams.autoSearch === "1"');
    expect(projectPageSource).toContain("loadCachedProjectSupplierOffers");
    expect(projectPageSource).toContain("autoStart={autoStartSupplierSearch}");
    expect(supplierSearchSource).toContain("!autoStart ||");
    expect(supplierSearchSource).toContain('url.searchParams.delete("autoSearch")');
    expect(supplierSearchSource).toContain("initialOutcome?.results ?? null");
  });

  it("restores cached results without invoking the live supplier provider", () => {
    expect(productSearchServiceSource).toContain(
      "Restores the last successful result set from the persistent cache",
    );
    expect(productSearchServiceSource).toContain("findLastSuccessfulSupplierSearch(providerInput)");
    expect(productSearchServiceSource).toContain('resultOrigin: "cache"');
    expect(productSearchServiceSource).toContain("storeSuccessfulSupplierSearch(providerInput, presentation.results)");
  });

  it("labels the explicit paid refresh action in every supported language", () => {
    expect(getLunaSearchCopy("sr").repeatSearch).toBe("Ponovi živu pretragu");
    expect(getLunaSearchCopy("de").repeatSearch).toBe("Live-Suche wiederholen");
    expect(getLunaSearchCopy("en").repeatSearch).toBe("Repeat live search");
    expect(supplierSearchSource).toContain("lunaCopy.repeatSearch");
    expect(supplierSearchSource).toContain("lunaCopy.cachedResultsNotice");
  });
});
