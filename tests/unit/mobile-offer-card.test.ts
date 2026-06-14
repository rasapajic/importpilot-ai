import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const offersPanelSource = readFileSync(
  join(process.cwd(), "components/offers/offers-panel.tsx"),
  "utf8",
);
const responsiveDetailsSource = readFileSync(
  join(process.cwd(), "components/offers/responsive-offer-details.tsx"),
  "utf8",
);

describe("mobile offer cards", () => {
  it("keeps decision signals visible and moves secondary fields under details", () => {
    expect(offersPanelSource).toContain("offer-highlights");
    expect(offersPanelSource).toContain("moq-badge");
    expect(offersPanelSource).toContain("risk-badge");
    expect(offersPanelSource).toContain("ResponsiveOfferDetails");
    expect(offersPanelSource).toContain("Prikaži detalje");
  });

  it("opens offer details on desktop and collapses them by default on mobile", () => {
    expect(responsiveDetailsSource).toContain("useState(false)");
    expect(responsiveDetailsSource).toContain('window.matchMedia("(max-width: 767px)")');
    expect(responsiveDetailsSource).toContain("setOpen(!query.matches)");
  });
});
