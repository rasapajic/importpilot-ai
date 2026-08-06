import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/search/supplier-offer-search.tsx"),
  "utf8",
);

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("multi-offer comparison selection", () => {
  it("keeps the result list open after each imported offer", () => {
    const addResultSource = sourceBetween(
      "async function addResult",
      "function continueWithSelectedOffers",
    );

    expect(addResultSource).toContain("markImported(index)");
    expect(addResultSource).not.toContain("router.refresh()");
  });

  it("uses comparison wording in all supported languages", () => {
    expect(source).toContain('add: "Dodaj za poređenje"');
    expect(source).toContain('added: "Dodato za poređenje"');
    expect(source).toContain('continue: "Nastavi sa odabranim ponudama"');
    expect(source).toContain('add: "Zum Vergleich hinzufügen"');
    expect(source).toContain('add: "Add for comparison"');
  });

  it("advances only through the explicit final action", () => {
    const continueSource = sourceBetween(
      "function continueWithSelectedOffers",
      "const strictFilterRemovedAll",
    );

    expect(source).toContain("imported.length > 0");
    expect(continueSource).toContain("router.refresh()");
    expect(source).toContain("comparisonText.selected(imported.length)");
  });
});
