import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const parent = readFileSync(join(root, "components/search/simple-supplier-offer-search.tsx"), "utf8");
const child = readFileSync(join(root, "components/search/source-moq-verification-panel.tsx"), "utf8");
const route = readFileSync(join(root, "app/api/projects/[projectId]/supplier-search/url-preview/route.ts"), "utf8");

describe("source MOQ card acceptance wiring #187", () => {
  it("gates cached teaser priority before source verification and re-ranks after the exact-URL check", () => {
    expect(parent).toContain('advertisedPrice: origin === "cache" && !sourceVerified');
    expect(parent).toContain("resultWithSourceMoq(savedResult, evidence)");
    expect(parent).toContain("preliminaryAdvertisedScorePresentation(");
    expect(parent).toContain("inquiryContactPriority(");
  });

  it("keeps the saved MOQ immutable in automatic preview and uses explicit read-only comparison", () => {
    expect(parent).toContain("minimumOrderQuantity: result.minimumOrderQuantity,");
    expect(parent).toContain("<SourceMoqVerificationPanel");
    expect(child).toContain("reconcileSourceMoq(");
    expect(child).toContain('cache: "no-store"');
    expect(route).toContain("checkedAt: new Date().toISOString()");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("keeps SR Latin labels, original 1,000 request and a responsive, wrapping verification area", () => {
    expect(child).toContain("Proveri MOQ na originalnoj stranici");
    expect(child).toContain("Sačuvana pretraga nije izmenjena.");
    expect(child).toContain('overflowWrap: "anywhere", minWidth: 0');
    expect(parent).toContain("quantity={quantity}");
    expect(parent).toContain("supplier-terms-warning");
    expect(parent).not.toContain("Razmotri 1.200");
  });
});
