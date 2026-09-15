import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"),
  "utf8",
);
const progressCss = readFileSync(
  join(process.cwd(), "app/taja-search-progress.css"),
  "utf8",
);

describe("ImportPilot 1.0 live supplier-search feedback", () => {
  it("keeps an accessible live status while the search request is pending", () => {
    expect(componentSource).toContain(
      '{loading && <p className="muted-text" role="status">{text.searching}</p>}',
    );
  });

  it("turns the simple auto-search status into visible indeterminate progress", () => {
    expect(progressCss).toContain(
      '.supplier-search:not(:has(.search-result-list)):not(:has(.empty-state))',
    );
    expect(progressCss).toContain('> .muted-text[role="status"]::before');
    expect(progressCss).toContain('> .muted-text[role="status"]::after');
    expect(progressCss).toContain("animation: taja-search-spinner");
    expect(progressCss).toContain("animation: taja-search-progress");
    expect(progressCss).toContain("cursor: progress");
  });

  it("respects reduced-motion preferences", () => {
    expect(progressCss).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
