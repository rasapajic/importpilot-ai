import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canDeleteEmptySearch } from "../../modules/projects/domain/empty-search-deletion";
import { translateText } from "../../modules/i18n/translations";

const deleteButtonSource = readFileSync(
  join(process.cwd(), "components/projects/delete-empty-search-button.tsx"),
  "utf8",
);
const supplierSearchSource = readFileSync(
  join(process.cwd(), "components/search/supplier-offer-search.tsx"),
  "utf8",
);
const projectPageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);

describe("empty search deletion", () => {
  it("allows deleting an empty failed search", () => {
    expect(canDeleteEmptySearch({
      offerCount: 0,
      calculationCount: 0,
      documentCount: 0,
      hasCompletedRecommendation: false,
    })).toBe(true);
  });

  it("blocks deletion once useful data exists", () => {
    expect(canDeleteEmptySearch({
      offerCount: 1,
      calculationCount: 0,
      documentCount: 0,
      hasCompletedRecommendation: false,
    })).toBe(false);
    expect(canDeleteEmptySearch({
      offerCount: 0,
      calculationCount: 1,
      documentCount: 0,
      hasCompletedRecommendation: false,
    })).toBe(false);
    expect(canDeleteEmptySearch({
      offerCount: 0,
      calculationCount: 0,
      documentCount: 1,
      hasCompletedRecommendation: false,
    })).toBe(false);
    expect(canDeleteEmptySearch({
      offerCount: 0,
      calculationCount: 0,
      documentCount: 0,
      hasCompletedRecommendation: true,
    })).toBe(false);
  });

  it("shows delete search only when the project is safe to delete", () => {
    expect(projectPageSource).toContain("canDeleteEmptySearch");
    expect(projectPageSource).toContain("canDeleteCurrentSearch");
    expect(projectPageSource).toContain("DeleteEmptySearchButton");
  });

  it("shows provider failure actions", () => {
    expect(supplierSearchSource).toContain("provider-error-actions");
    expect(supplierSearchSource).toContain("Pokušaj ponovo");
    expect(supplierSearchSource).toContain("DeleteEmptySearchButton");
    expect(supplierSearchSource).toContain("Uvezi iz linka");
    expect(supplierSearchSource).toContain("importpilot:manual-offer");
  });

  it("uses a confirmation dialog and redirects to dashboard after delete", () => {
    expect(deleteButtonSource).toContain("<dialog");
    expect(deleteButtonSource).toContain("Obrisati pretragu?");
    expect(deleteButtonSource).toContain("Ova pretraga nema korisne podatke");
    expect(deleteButtonSource).toContain('router.push("/dashboard")');
  });

  it("localizes delete search labels", () => {
    expect(translateText("Obriši pretragu", "en")).toBe("Delete search");
    expect(translateText("Obrisati pretragu?", "de")).toBe("Suche löschen?");
    expect(translateText("Otkaži", "sr")).toBe("Otkaži");
  });
});
