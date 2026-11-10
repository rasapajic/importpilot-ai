import { describe, expect, it, vi } from "vitest";
import { parseProductPreview } from "../../services/importpilot-url-import-provider/src/parser";
import {
  createDetailedSupplierOfferUrlImportProvider,
  normalizeExternalSupplierName,
} from "../../modules/product-search/infrastructure/detailed-url-import-provider";

const url = "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";
const catalogUrl = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const sellerLabel = "Pilot Optics International Corp.Ltd.Wenzhou";

describe("JAKOV360 #218 explicit compact supplier identity", () => {
  it("recognizes the exact seller label and legal name returned by the parser", () => {
    expect(normalizeExternalSupplierName(sellerLabel)).toBe(sellerLabel);
    expect(normalizeExternalSupplierName("Pilot Optics International Corp.Ltd."))
      .toBe("Pilot Optics International Corp.Ltd.");
    expect(normalizeExternalSupplierName("Pilot Optics International Corp. Ltd. Wenzhou"))
      .toBe("Pilot Optics International Corp. Ltd.");
  });

  it("retains the seller identity across exact URL parser and application preview", async () => {
    const html = [
      "<html><head><meta property='og:title' content='Pilot Optics 2023 Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses'></head>",
      "<body><h1>Pilot Optics 2023 Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses</h1>",
      '<a href="https://pilotoptics.en.made-in-china.com">Pilot Optics International Corp.Ltd.Wenzhou</a>',
      "<section class='product-description'>FAQ Q3: What's your MOQ? A3:1200 pcs per item</section></body></html>",
    ].join("");
    const parsed = parseProductPreview(html, url);
    expect(parsed.supplierName).toContain("Pilot Optics International");
    const rawResponse = {
      ...parsed,
      price: null,
      minimumOrderQuantity: null,
      details: null,
      moqConflictEvidence: {
        kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
        productUrl: url, sourceUrl: catalogUrl,
        faqMinimumOrderQuantity: 1200, catalogMinimumOrderQuantity: 300,
        lowPrice: "0.50", highPrice: "2.00",
        currency: "USD", unit: "Piece",
        corroborated: false, verifiedQuote: false, landedCostEligible: false,
      },
    };
    const fetcher = vi.fn(async () => Response.json({ preview: rawResponse }));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://test-provider.invalid/preview",
      fetcher: fetcher as typeof fetch,
    });
    const preview = await provider.previewSupplierOfferUrl(url);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(preview.supplierName).toContain("Pilot Optics International");
    expect(preview.price).toBeNull();
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.details).toBeNull();
    expect(preview.moqConflictEvidence).toMatchObject({
      faqMinimumOrderQuantity: 1200,
      catalogMinimumOrderQuantity: 300,
      verifiedQuote: false, landedCostEligible: false,
    });
  });

  it("does not infer supplier identity from title or vague marketing prose", async () => {
    expect(normalizeExternalSupplierName(
      "Pilot Optics established in 1999, is a prominent manufacturer",
    )).toBeNull();
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://test-provider.invalid/preview",
      fetcher: vi.fn(async () => Response.json({ preview: {
        productTitle: "Pilot Optics Fashion Reading Glasses",
        supplierName: null, price: null, currency: "USD",
        minimumOrderQuantity: null, incoterm: null, imageUrl: null,
        productUrl: url, details: null,
      } })) as typeof fetch,
    });
    const preview = await provider.previewSupplierOfferUrl(url);
    expect(preview.supplierName).toBeNull();
  });
});
