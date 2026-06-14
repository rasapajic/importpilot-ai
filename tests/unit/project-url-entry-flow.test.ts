import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const createFormSource = readFileSync(
  join(process.cwd(), "components/projects/create-project-form.tsx"),
  "utf8",
);
const urlFirstFormSource = readFileSync(
  join(process.cwd(), "components/projects/create-project-from-url-form.tsx"),
  "utf8",
);
const newProjectPageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/new/page.tsx"),
  "utf8",
);
const urlImportSource = readFileSync(
  join(process.cwd(), "components/search/url-import-review.tsx"),
  "utf8",
);
const globalUrlPreviewRouteSource = readFileSync(
  join(process.cwd(), "app/api/supplier-url-preview/route.ts"),
  "utf8",
);
const projectUrlPreviewRouteSource = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/supplier-search/url-preview/route.ts"),
  "utf8",
);

describe("project URL entry flow", () => {
  it("focuses product name for standard search flow", () => {
    expect(createFormSource).toContain('if (mode === "search") productNameRef.current?.focus()');
    expect(createFormSource).toContain('data-entry-mode={mode}');
  });

  it("renders a URL-first form for URL import mode", () => {
    expect(newProjectPageSource).toContain('mode === "url" ? t("Ubaci link proizvoda") : t("Nova pretraga")');
    expect(newProjectPageSource).toContain("CreateProjectFromUrlForm");
    expect(urlFirstFormSource).toContain("Link proizvoda");
    expect(urlFirstFormSource.indexOf("Link proizvoda")).toBeLessThan(urlFirstFormSource.indexOf("Količina"));
    expect(urlFirstFormSource).toContain("/api/supplier-url-preview");
  });

  it("focuses the product link input when URL import opens", () => {
    expect(urlImportSource).toContain("urlInputRef.current?.focus()");
    expect(urlFirstFormSource).toContain("urlInputRef.current?.focus()");
    expect(urlFirstFormSource).toContain("ref={urlInputRef}");
  });

  it("creates the project only after preview and imports extracted offer data", () => {
    expect(urlFirstFormSource.indexOf("setPreview(payload.preview)")).toBeLessThan(urlFirstFormSource.indexOf('fetch("/api/projects"'));
    expect(urlFirstFormSource).toContain("supplier-search/import");
    expect(urlFirstFormSource).toContain("Kreiraj pretragu");
  });

  it("offers manual fallback when recognized URL fetching is blocked or unavailable", () => {
    expect(urlFirstFormSource).toContain("manualFallbackErrors");
    expect(urlFirstFormSource).toContain("Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda.");
    expect(urlFirstFormSource).toContain("Došlo je do mrežne greške. Pokušajte ponovo.");
    expect(urlFirstFormSource).toContain("Nastavite ručno bez ponovnog pokretanja.");
    expect(urlFirstFormSource).toContain("Nastavi ručno");
    expect(urlFirstFormSource).toContain("fallbackPreview");
    expect(urlFirstFormSource).toContain("Naziv proizvoda procenjen iz linka");
    expect(urlFirstFormSource).toContain("productUrl,");
    expect(urlFirstFormSource).toContain("source: new URL(productUrl).hostname");
  });

  it("shows partial extraction without sending UI-only fields to offer import", () => {
    expect(urlFirstFormSource).toContain("Delimično prepoznati podaci");
    expect(urlFirstFormSource).toContain("preview.isPartial");
    expect(urlFirstFormSource).toContain("supplierCountry: preview.supplierCountry");
    expect(urlFirstFormSource).not.toContain("...preview");
    expect(urlImportSource).toContain("Delimično prepoznati podaci");
    expect(urlImportSource).toContain("preview.isPartial");
    expect(urlImportSource).toContain("supplierCountry: preview.supplierCountry");
    expect(urlImportSource).not.toContain("...preview");
  });

  it("returns specific URL import errors from both preview routes", () => {
    for (const source of [globalUrlPreviewRouteSource, projectUrlPreviewRouteSource]) {
      expect(source).toContain("Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda.");
      expect(source).toContain("Nismo uspeli da pronađemo podatke o proizvodu na ovoj stranici.");
      expect(source).toContain("Link nije prepoznat kao Alibaba ili Made-in-China proizvod.");
      expect(source).toContain("Došlo je do mrežne greške. Pokušajte ponovo.");
      expect(source).not.toContain("Podaci iz linka nisu mogli biti preuzeti.");
    }
  });
});
