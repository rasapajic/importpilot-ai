import { describe, expect, it, vi } from "vitest";

import { supplierOfferUrlImportRequestSchema } from "../../modules/product-search/domain/search";
import {
  buildSlugFallbackPreview,
  createExternalSupplierOfferUrlImportProvider,
  createSupplierOfferUrlImportProvider,
  getSupplierOfferUrlImportProvider,
  supplierOfferUrlImportProvider,
  UrlImportBlockedError,
  UrlImportExternalProviderError,
  UrlImportFetchError,
  UrlImportMissingProductIdentifierError,
  UrlImportParsingError,
  UrlImportTimeoutError,
  UrlImportUnsupportedUrlError,
} from "../../modules/product-search/infrastructure/url-import-provider";

const publicResolver = async () => ["203.0.113.10"];

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status,
  });
}

describe("supplier offer URL import provider", () => {
  it("extracts best-effort fields from an Alibaba product-detail URL", async () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://sc04.alicdn.com/product.jpg">
        <script type="application/ld+json">
          {"@type":"Product","name":"USB Type C Charger","brand":{"name":"Shenzhen Power Co."},
           "offers":{"price":"1.72","priceCurrency":"USD"}}
        </script>
      </head><body>MOQ: 100 units, FOB Shenzhen</body></html>`;
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse(html),
    });

    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/USB-Type-C-Charger_1600000000001.html")).resolves.toMatchObject({
      title: "USB Type C Charger",
      supplierName: "Shenzhen Power Co.",
      price: 1.72,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      imageUrl: "https://sc04.alicdn.com/product.jpg",
      source: "www.alibaba.com",
    });
  });

  it("uses the local fetch path when no external URL import provider is configured", async () => {
    vi.stubEnv("URL_IMPORT_PROVIDER_URL", "");
    expect(getSupplierOfferUrlImportProvider()).toBe(supplierOfferUrlImportProvider);
    vi.unstubAllEnvs();
  });

  it("uses an external URL import provider when configured", async () => {
    const provider = createExternalSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "secret-token",
      fetcher: async (url, init) => {
        expect(url).toBe("https://url-import.example/preview");
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
        expect(init?.body).toBe(JSON.stringify({
          productUrl: "https://www.alibaba.com/product-detail/External-Charger_1600000000101.html",
        }));
        return Response.json({
          preview: {
            productTitle: "External charger",
            supplierName: "External Supplier",
            supplierCountry: "CN",
            price: "2.4",
            currency: "USD",
            minimumOrderQuantity: "100",
            incoterm: "FOB",
            productUrl: "https://www.alibaba.com/product-detail/External-Charger_1600000000101.html",
            imageUrl: null,
          },
        });
      },
    });

    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/External-Charger_1600000000101.html")).resolves.toMatchObject({
      title: "External charger",
      supplierName: "External Supplier",
      source: "www.alibaba.com",
      price: 2.4,
      minimumOrderQuantity: 100,
    });
  });

  it("accepts partial successful Made-in-China previews from the external provider", async () => {
    const productUrl = "https://engtianvehicle.en.made-in-china.com/product/dOfmlFDuEHcI/China-Electric-Scooter-Hot-Selling-Made-in-China-High-Quality-Popular-Model-and-Cheaper-CKD-Price.html";
    const provider = createExternalSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "secret-token",
      fetcher: async () => Response.json({
        preview: {
          productTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price",
          supplierName: null,
          price: "165.00",
          currency: "USD",
          minimumOrderQuantity: null,
          incoterm: "EXW",
          productUrl,
          imageUrl: "https://image.made-in-china.com/202f0j00electric-scooter.jpg",
        },
      }),
    });

    await expect(provider.previewSupplierOfferUrl(productUrl)).resolves.toMatchObject({
      title: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price",
      supplierName: null,
      price: 165,
      currency: "USD",
      minimumOrderQuantity: null,
      incoterm: "EXW",
      imageUrl: "https://image.made-in-china.com/202f0j00electric-scooter.jpg",
      source: "engtianvehicle.en.made-in-china.com",
      isPartial: true,
    });
  });

  it("keeps manual fallback available when the external provider fails", async () => {
    const provider = createExternalSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      fetcher: async () => Response.json({ error: "upstream unavailable" }, { status: 502 }),
    });

    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Failed-Provider-Charger_1600000000102.html"))
      .rejects.toBeInstanceOf(UrlImportExternalProviderError);
    expect(buildSlugFallbackPreview("https://www.alibaba.com/product-detail/Failed-Provider-Charger_1600000000102.html")?.title)
      .toBe("Failed Provider Charger");
  });

  it("accepts Alibaba share URLs and parses redirected product HTML", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse(`
        <html><body>
          <script>{"subject":"Fast Phone Charger","companyName":"Ningbo Charge Factory","price":"2.10","currency":"USD"}</script>
          Minimum order quantity: 300 pcs CIF
        </body></html>
      `),
    });

    await expect(provider.previewSupplierOfferUrl("https://s.alibaba.com/abc123")).resolves.toMatchObject({
      title: "Fast Phone Charger",
      supplierName: "Ningbo Charge Factory",
      price: 2.1,
      currency: "USD",
      minimumOrderQuantity: 300,
      incoterm: "CIF",
      source: "s.alibaba.com",
    });
  });

  it("maximizes extraction from Alibaba embedded JSON and meta tags", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse(`
        <html>
          <head>
            <meta property="og:title" content="Meta fallback charger">
            <meta property="og:image" content="//sc04.alicdn.com/kf/main-charger.jpg">
          </head>
          <body>
            <script>
              window.__pageData__ = {
                "productTitle": "Alibaba 65W GaN Type C Charger",
                "companyName": "Guangzhou Smart Power Ltd.",
                "priceRange": "US $4.80 - 5.60",
                "currencyCode": "USD",
                "minOrderQuantity": 1000,
                "mainImageUrl": "//sc04.alicdn.com/kf/charger.jpg"
              };
            </script>
            FOB Shenzhen
          </body>
        </html>
      `),
    });

    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/GaN-Type-C-Charger_1600000000099.html")).resolves.toMatchObject({
      title: "Alibaba 65W GaN Type C Charger",
      supplierName: "Guangzhou Smart Power Ltd.",
      price: 4.8,
      currency: "USD",
      minimumOrderQuantity: 1000,
      incoterm: "FOB",
      imageUrl: "https://sc04.alicdn.com/kf/main-charger.jpg",
      isPartial: false,
    });
  });

  it("extracts best-effort fields from a Made-in-China product URL", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse(`
        <html><head><meta property="og:image" content="https://image.made-in-china.com/ch.jpg"></head>
          <body>
            <h1>GaN Mobile Phone Charger</h1>
            <div>Company Name: Xiamen Charger Supplier</div>
            <div>FOB Price: US$ 3.45 / Piece</div>
            <div>MOQ: 200 Pieces</div>
          </body>
        </html>
      `),
    });

    await expect(provider.previewSupplierOfferUrl("https://www.made-in-china.com/productdetail/GaN-Mobile-Phone-Charger_abc123.html")).resolves.toMatchObject({
      title: "GaN Mobile Phone Charger",
      supplierName: "Xiamen Charger Supplier",
      price: 3.45,
      currency: "USD",
      minimumOrderQuantity: 200,
      imageUrl: "https://image.made-in-china.com/ch.jpg",
      source: "www.made-in-china.com",
    });
  });

  it("accepts Made-in-China supplier subdomain URLs and builds a readable slug fallback", async () => {
    const productUrl = "https://engtianvehicle.en.made-in-china.com/product/dOfmlFDuEHcI/China-Electric-Scooter-Hot-Selling-Made-in-China-High-Quality-Popular-Model-and-Cheaper-CKD-Price.html";
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse(`
        <html><head><meta property="og:image" content="https://image.made-in-china.com/scooter.jpg"></head>
          <body>
            <h1>Electric Scooter Hot Selling Model</h1>
            <div>Company Name: Tian Vehicle Supplier</div>
            <div>FOB Price: US$ 120.00 / Piece</div>
            <div>MOQ: 10 Pieces</div>
          </body>
        </html>
      `),
    });

    await expect(provider.previewSupplierOfferUrl(productUrl)).resolves.toMatchObject({
      title: "Electric Scooter Hot Selling Model",
      supplierName: "Tian Vehicle Supplier",
      price: 120,
      currency: "USD",
      minimumOrderQuantity: 10,
      source: "engtianvehicle.en.made-in-china.com",
    });
    expect(buildSlugFallbackPreview(productUrl)?.title)
      .toBe("China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price");
  });

  it("rejects invalid, non-HTTPS, unsupported and private URLs with specific failures", async () => {
    expect(supplierOfferUrlImportRequestSchema.safeParse({ productUrl: "http://www.alibaba.com/product-detail/fan_1.html" }).success).toBe(false);

    const provider = createSupplierOfferUrlImportProvider({ resolveHost: publicResolver });
    await expect(provider.previewSupplierOfferUrl("https://supplier.example/fan")).rejects.toBeInstanceOf(UrlImportUnsupportedUrlError);
    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/showroom/phone-charger.html")).rejects.toBeInstanceOf(UrlImportMissingProductIdentifierError);

    const privateResolver = async () => ["127.0.0.1"];
    const privateProvider = createSupplierOfferUrlImportProvider({ resolveHost: privateResolver });
    await expect(privateProvider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/fan_1600000000001.html")).rejects.toBeInstanceOf(UrlImportFetchError);
  });

  it("aborts slow responses after the configured timeout", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      timeoutMs: 5,
      fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    });
    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Slow-Charger_1600000000002.html")).rejects.toBeInstanceOf(UrlImportTimeoutError);
  });

  it("returns missing optional fields as null for manual review", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse("<html><head><title>Basic charger</title></head></html>"),
    });
    const preview = await provider.previewSupplierOfferUrl("https://www.made-in-china.com/productdetail/Basic-Charger_abc123.html");
    expect(preview.title).toBe("Basic charger");
    expect(preview.supplierName).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.isPartial).toBe(true);
  });

  it("returns partial extraction when only MOQ or currency is visible", async () => {
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse("<html><body>Minimum order quantity: 500 pcs. Price shown in USD.</body></html>"),
    });
    const preview = await provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Partial-Charger_1600000000098.html");
    expect(preview.title).toBeNull();
    expect(preview.currency).toBe("USD");
    expect(preview.minimumOrderQuantity).toBe(500);
    expect(preview.isPartial).toBe(true);
  });

  it("builds a slug fallback preview when live fetch fails", () => {
    const preview = buildSlugFallbackPreview("https://www.alibaba.com/product-detail/Factory-Wholesale-20W-PD-Fast-Charger_1601287661261.html");
    expect(preview).toMatchObject({
      title: "Factory Wholesale 20W PD Fast Charger",
      supplierName: null,
      price: null,
      productUrl: "https://www.alibaba.com/product-detail/Factory-Wholesale-20W-PD-Fast-Charger_1601287661261.html",
      source: "www.alibaba.com",
      isPartial: true,
      titleFromSlug: true,
    });
  });

  it("detects Alibaba block pages and parsing failures", async () => {
    const blockedProvider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse("<html><title>Security Check</title><body>captcha verify you are human</body></html>"),
    });
    await expect(blockedProvider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Blocked-Charger_1600000000003.html")).rejects.toBeInstanceOf(UrlImportBlockedError);

    const emptyProvider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse("<html><body><nav>No product here</nav></body></html>"),
    });
    await expect(emptyProvider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Empty-Charger_1600000000004.html")).rejects.toBeInstanceOf(UrlImportParsingError);
  });

  it("logs URL diagnostics in development mode without tokens", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = createSupplierOfferUrlImportProvider({
      resolveHost: publicResolver,
      fetcher: async () => htmlResponse("<html><title>Security Check</title><body>captcha</body></html>", 200),
    });

    await expect(provider.previewSupplierOfferUrl("https://www.alibaba.com/product-detail/Blocked-Charger_1600000000005.html")).rejects.toBeInstanceOf(UrlImportBlockedError);

    expect(info).toHaveBeenCalledWith(
      "[url-import]",
      expect.stringContaining("\"provider\":\"alibaba\""),
    );
    expect(info).toHaveBeenCalledWith(
      "[url-import]",
      expect.stringContaining("\"httpStatus\":200"),
    );
    expect(info).toHaveBeenCalledWith(
      "[url-import]",
      expect.stringContaining("\"finalReason\":\"blocked\""),
    );
    info.mockRestore();
    vi.unstubAllEnvs();
  });
});
