import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const loadingSource = readFileSync(join(process.cwd(), "app/loading.tsx"), "utf8");
const translationsSource = readFileSync(
  join(process.cwd(), "modules/i18n/translations.ts"),
  "utf8",
);

describe("JAKOV360 locale consistency", () => {
  it("localizes the loading screen for SR, DE and EN and removes old branding", () => {
    expect(loadingSource).toContain('"use client"');
    expect(loadingSource).toContain("useI18n");
    expect(loadingSource).toContain('title: "JAKOV360-Daten werden geladen..."');
    expect(loadingSource).toContain('title: "Učitavanje JAKOV360 podataka..."');
    expect(loadingSource).toContain('title: "Loading JAKOV360 data..."');
    expect(loadingSource).not.toContain("ImportPilot");
  });

  it("translates the offer-selection workflow summary", () => {
    expect(translationsSource).toContain(
      '{ en: "No offer selected yet.", de: "Noch kein Angebot ausgewählt.", sr: "Još nema izabrane ponude." }',
    );
    expect(translationsSource).toContain(
      '{ en: "An offer has been selected.", de: "Ein Angebot wurde ausgewählt.", sr: "Ponuda je izabrana." }',
    );
  });
});
