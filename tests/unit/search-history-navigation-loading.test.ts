import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const linkSource = readFileSync(
  join(process.cwd(), "components/dashboard/search-history-link.tsx"),
  "utf8",
);
const dashboardSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/dashboard/page.tsx"),
  "utf8",
);
const cssSource = readFileSync(
  join(process.cwd(), "app/globals.css"),
  "utf8",
);

describe("saved search navigation feedback", () => {
  it("shows an immediate pending state before route navigation", () => {
    expect(linkSource).toContain("flushSync(() => setPending(true))");
    expect(linkSource).toContain("router.push(href)");
    expect(linkSource).toContain("aria-busy={pending}");
    expect(linkSource).toContain('className="search-navigation-overlay"');
    expect(linkSource).toContain('role="status"');
  });

  it("localizes the navigation feedback", () => {
    expect(linkSource).toContain('title: "Otvaranje pretrage..."');
    expect(linkSource).toContain('title: "Suche wird geöffnet..."');
    expect(linkSource).toContain('title: "Opening search..."');
  });

  it("uses pending-aware links for saved searches on the dashboard", () => {
    expect(dashboardSource).toContain("SearchHistoryLink");
    expect(dashboardSource).toContain("locale={locale}");
    expect(dashboardSource).toContain("`/projects/${project.id}`");
  });

  it("covers the screen with a visible loading layer on slow navigation", () => {
    expect(cssSource).toContain(".search-navigation-overlay");
    expect(cssSource).toContain("position: fixed");
    expect(cssSource).toContain("z-index: 200");
    expect(cssSource).toContain(".search-navigation-card");
  });
});
