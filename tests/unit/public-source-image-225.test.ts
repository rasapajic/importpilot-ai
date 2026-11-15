import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  eligibleExactProductPage,
  imageFromExactSourcePage,
  isPublicIpv4ForSource,
  recoverExactSourceProductImage,
} from "@/modules/product-search/infrastructure/public-source-image";

const SOURCE = "https://mazerwholesale.com/product/reading-glasses-with-plastic-frame/";
const TITLE = "Reading Glasses, Plastic Frame Readers, Assorted Strength";
const PAGE = '<html><head>' +
  '<meta property="og:title" content="Reading Glasses – Plastic Frame – Unisex Style – Black">' +
  '<meta property="og:image" content="https://mazerwholesale.com/wp-content/uploads/reading-glasses.jpg?size=large&amp;quality=80">' +
  '</head><body><h1>Reading Glasses</h1></body></html>';

describe("Issue #225 exact-page supplier photo provenance", () => {
  it("recovers only the same public product page's image metadata and decodes HTML entities", () => {
    expect(imageFromExactSourcePage(PAGE, SOURCE, TITLE)).toBe(
      "https://mazerwholesale.com/wp-content/uploads/reading-glasses.jpg?size=large&quality=80",
    );
  });

  it("reads image metadata regardless of attribute order", () => {
    const page = '<head><meta content="Reading Glasses Plastic Frame" property="og:title">' +
      '<meta content="/images/reading-glasses.webp" property="og:image"></head>';
    expect(imageFromExactSourcePage(page, SOURCE, TITLE)).toBe(
      "https://mazerwholesale.com/images/reading-glasses.webp",
    );
  });

  it("rejects generic site logos, unrelated products and wrong sources", () => {
    const logo = PAGE.replace(
      "wp-content/uploads/reading-glasses.jpg", "wp-content/uploads/company-logo.png",
    );
    expect(imageFromExactSourcePage(logo, SOURCE, TITLE)).toBeNull();
    expect(imageFromExactSourcePage(PAGE, SOURCE, "Industrial hydraulic press controls")).toBeNull();
    expect(imageFromExactSourcePage(PAGE, SOURCE, "Reading Glasses")).toBe(
      "https://mazerwholesale.com/wp-content/uploads/reading-glasses.jpg?size=large&quality=80",
    );
  });

  it("rejects catalog PDFs, generic categories, ports and private hostnames", () => {
    expect(eligibleExactProductPage("https://tecfenmedical.com/wp-content/uploads/catalog.pdf")).toBeNull();
    expect(eligibleExactProductPage("https://www.lanseeoptic.com/product_category/reading-glasses/")).toBeNull();
    expect(eligibleExactProductPage("http://mazerwholesale.com/product/reading-glasses/")).toBeNull();
    expect(eligibleExactProductPage("https://127.0.0.1/product/reading-glasses/")).toBeNull();
    expect(eligibleExactProductPage("https://localhost/product/reading-glasses/")).toBeNull();
    expect(eligibleExactProductPage("https://foo.internal/product/reading-glasses/")).toBeNull();
    expect(eligibleExactProductPage("https://mazerwholesale.com:8443/product/reading-glasses/")).toBeNull();
  });

  it("rejects metadata-IP, private, carrier-NAT, loopback and multicast DNS answers", () => {
    for (const address of [
      "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254",
      "100.100.100.200", "172.20.0.1", "192.168.1.2",
      "192.0.2.10", "198.18.0.1", "224.0.0.1",
    ]) expect(isPublicIpv4ForSource(address)).toBe(false);
    expect(isPublicIpv4ForSource("8.8.8.8")).toBe(true);
  });

  it("fails closed before requesting an IP if DNS contains any private address", async () => {
    const readPage = vi.fn(async () => PAGE);
    const image = await recoverExactSourceProductImage(SOURCE, TITLE, {
      lookup4: async () => ["8.8.8.8", "127.0.0.1"],
      readPage,
    });
    expect(image).toBeNull();
    expect(readPage).not.toHaveBeenCalled();
  });

  it("reads at the validated IP and changes image only (no quote or MOQ)", async () => {
    const readPage = vi.fn(async () => PAGE);
    const image = await recoverExactSourceProductImage(SOURCE, TITLE, {
      lookup4: async () => ["8.8.8.8"],
      readPage,
    });
    expect(image).toContain("/reading-glasses.jpg?");
    expect(readPage).toHaveBeenCalledOnce();
    expect(readPage.mock.calls[0]?.[1]).toBe("8.8.8.8");
  });
});

describe("Issue #225 integration contracts", () => {
  const route = readFileSync(join(process.cwd(),
    "app/api/projects/[projectId]/supplier-search/source-image/route.ts"), "utf8");
  const client = readFileSync(join(process.cwd(),
    "components/search/simple-supplier-offer-search.tsx"), "utf8");

  it("authenticates and matches an existing cached source before visiting it", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("prisma.importProject.findFirst");
    expect(route).toContain("prisma.supplierSearchCache.findMany");
    expect(route).toContain("result.productUrl === parsed.data.productUrl");
    expect(route).toContain("result.title === parsed.data.title");
    expect(route).toContain("withinSourceImageBudget(organizationId)");
  });

  it("keeps the paid search and commercial fields separate", () => {
    expect(client).toContain('"/supplier-search/source-image"');
    expect(client).toContain("sourceImageAttemptedUrls.current");
    expect(client).toContain("Math.min(3, candidates.length)");
    expect(client).toContain("result.productUrl === candidate.productUrl");
    expect(client).toContain("{ ...result, imageUrl: payload.imageUrl! }");
    expect(route).not.toContain("price:");
    expect(route).not.toContain("unitPrice:");
    expect(route).not.toContain("prisma.supplierSearchCache.create");
    expect(route).not.toContain("prisma.supplierSearchCache.update");
    expect(route).not.toContain("prisma.supplierOffer.create");
  });
});
