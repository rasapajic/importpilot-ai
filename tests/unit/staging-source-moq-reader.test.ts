import { describe, expect, it } from "vitest";

import {
  createAcceptanceLocalMoqReader,
  DILICN_187_EXACT_PRODUCT_URL,
  JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID,
  shouldUseAcceptanceLocalMoqReader,
} from "../../modules/product-search/infrastructure/staging-source-moq-reader";
import { UrlImportFetchError } from "../../modules/product-search/infrastructure/url-import-provider";

const resolver = async () => ["203.0.113.10"];
const body = `<html><head>
  <meta property="og:title" content="New Model Senior Reading Glasses High Definition">
  <meta property="og:image" content="https://image.made-in-china.com/glasses.jpg">
  <script>{"companyName":"Wenzhou Dilicn Optical Co., Ltd.","price":"0.18","currency":"USD","moq":200}</script>
</head><body><h1>New Model Senior Reading Glasses High Definition</h1>
  <span>US$0.18</span><span>1,200 Pieces (MOQ)</span>
  <span>Trial MOQ 12 per color</span>
</body></html>`;

function htmlResponse(url: string, html = body, status = 200) {
  const response = new Response(html, { status, headers: { "content-type": "text/html" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("#187 isolated staging local reader selection", () => {
  const enabled = {
    serviceId: JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID,
    enabled: "1",
    sourceMoqCheck: true,
    productUrl: DILICN_187_EXACT_PRODUCT_URL,
  };
  it("requires all four server-side and exact-SKU conditions", () => {
    expect(shouldUseAcceptanceLocalMoqReader(enabled)).toBe(true);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, serviceId: "srv-production" })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, serviceId: undefined })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, enabled: "0" })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, enabled: undefined })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, sourceMoqCheck: false })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, productUrl: DILICN_187_EXACT_PRODUCT_URL.replace("jYzpeDtbEMkd", "otherSku") })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, productUrl: DILICN_187_EXACT_PRODUCT_URL.replace("dilicn.", "other.") })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, productUrl: "http://127.0.0.1/internal" })).toBe(false);
    expect(shouldUseAcceptanceLocalMoqReader({ ...enabled, productUrl: DILICN_187_EXACT_PRODUCT_URL + "?variant=another" })).toBe(false);
  });

  it("parses source-labeled 1200 above stale embedded 200 without following redirects", async () => {
    let calls = 0;
    const reader = createAcceptanceLocalMoqReader({
      resolveHost: resolver,
      fetcher: async (input, init) => {
        calls++;
        expect(String(input)).toBe(DILICN_187_EXACT_PRODUCT_URL);
        expect(init?.redirect).toBe("manual");
        return htmlResponse(DILICN_187_EXACT_PRODUCT_URL);
      },
    });
    const result = await reader.previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL);
    expect(result).toMatchObject({
      minimumOrderQuantity: 1200,
      price: 0.18,
      currency: "USD",
      productUrl: DILICN_187_EXACT_PRODUCT_URL,
      isPartial: false,
    });
    expect(calls).toBe(1);
  });

  it("rejects cross-SKU response URLs and a redirect, never invents verification", async () => {
    for (const response of [
      htmlResponse(DILICN_187_EXACT_PRODUCT_URL.replace("jYzpeDtbEMkd", "otherSku")),
      htmlResponse(DILICN_187_EXACT_PRODUCT_URL, "redirect", 302),
      new Response(body, { headers: { "content-type": "text/html" } }),
    ]) {
      const reader = createAcceptanceLocalMoqReader({
        resolveHost: resolver,
        fetcher: async () => response,
      });
      await expect(reader.previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL))
        .rejects.toBeInstanceOf(UrlImportFetchError);
    }
  });

  it("fails closed on inaccessible, partial or blocked marketplace pages", async () => {
    const reader = createAcceptanceLocalMoqReader({
      resolveHost: resolver,
      fetcher: async () => htmlResponse(DILICN_187_EXACT_PRODUCT_URL, "<html>Access Denied, CAPTCHA</html>"),
    });
    await expect(reader.previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL)).rejects.toThrow();

    const incomplete = createAcceptanceLocalMoqReader({
      resolveHost: resolver,
      fetcher: async () => htmlResponse(DILICN_187_EXACT_PRODUCT_URL,
        "<html><head><title>New Model Senior Reading Glasses</title></head><body>1,200 Pieces (MOQ)</body></html>"),
    });
    await expect(incomplete.previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL)).rejects.toThrow(
      "Source page lacks explicit visible listing MOQ.",
    );

    const embeddedOnly = createAcceptanceLocalMoqReader({
      resolveHost: resolver,
      fetcher: async () => htmlResponse(DILICN_187_EXACT_PRODUCT_URL,
        body.replace("1,200 Pieces (MOQ)", "Wholesale available")),
    });
    await expect(embeddedOnly.previewSupplierOfferUrl(DILICN_187_EXACT_PRODUCT_URL)).rejects.toThrow(
      "Source page lacks explicit visible listing MOQ.",
    );
  });
});
