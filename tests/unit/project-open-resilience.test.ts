import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const errorSource = readFileSync(join(process.cwd(), "app/error.tsx"), "utf8");
const projectSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);
const translationsSource = readFileSync(
  join(process.cwd(), "modules/i18n/translations.ts"),
  "utf8",
);

describe("JAKOV360 project opening resilience", () => {
  it("localizes the error boundary in SR, DE and EN", () => {
    expect(errorSource).toContain("useI18n");
    expect(errorSource).toContain('title: "Diese Seite konnte nicht angezeigt werden."');
    expect(errorSource).toContain('retry: "Erneut versuchen"');
    expect(errorSource).toContain('title: "Nismo mogli da prikažemo ovu stranicu."');
    expect(errorSource).toContain('title: "We could not display this page."');
  });

  it("does not let cached supplier restoration crash the saved project page", () => {
    expect(projectSource).toContain("loadCachedSupplierSearchSafely");
    expect(projectSource).toContain("try {");
    expect(projectSource).toContain("return await loadCachedProjectSupplierOffers");
    expect(projectSource).toContain("return null;");
    expect(projectSource).toContain("JAKOV360 cached supplier search restore failed");
  });

  it("contains no old ImportPilot loading translation", () => {
    expect(translationsSource).toContain("Loading JAKOV360 data...");
    expect(translationsSource).not.toContain("Loading ImportPilot data...");
  });
});
