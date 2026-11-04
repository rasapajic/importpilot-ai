import { describe, expect, it, vi } from "vitest";
import { parseProductPreview } from "../src/parser.js";
import { previewProductUrl } from "../src/fetcher.js";
import {
  videoChannelUrlForProduct,
  extractVideoChannelAdvertisedPriceRange,
} from "../src/video-channel-range.js";

const productUrl =
  "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const otherUrl =
  "https://pilotoptics.en.made-in-china.com/product/OTHERPRODUCT12/China-Pilot-Optics-Other-Reading-Glasses.html";
const videoUrl =
  "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";

function primaryHtml() {
  return '<html><head><meta property="og:title" content="Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses">' +
    '<script>{"price":"0.50","currency":"USD","minimumOrderQuantity":"200"}</script>' +
    '</head><body><h1>Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses</h1>' +
    '<div>US$0.50</div><div>1,200 Pieces (MOQ)</div>' +
    '<p>Q3: what is your MOQ?</p><p>A3:1200 pcs per item</p></body></html>';
}

function videoHtml({
  link = productUrl,
  heading = "What is Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses",
  price = "1,200 Pieces US$0.50-2.00 / Piece",
}: { link?: string; heading?: string; price?: string } = {}) {
  return '<html><body><h1>' + heading + '</h1>' +
    '<a href="' + link + '">Learn More</a>' +
    '<section><h2>Price</h2><div>Min. Order Reference FOB Price</div><div>' +
    price + '</div></section>' +
    '<section><h2>Recommended for you</h2>' +
    '<div>Other model 300 Pieces US$0.18-9.00 / Piece</div></section></body></html>';
}

describe("exact-SKU seller video channel evidence #199", () => {
  it("constructs only a fixed-host, exact-SKU URL from a valid supplier product URL", () => {
    expect(videoChannelUrlForProduct(productUrl)).toBe(videoUrl);
    expect(videoChannelUrlForProduct(productUrl.replace("https:", "http:"))).toBeNull();
    expect(videoChannelUrlForProduct("https://localhost/product/WJfUCnDTuekA/China-Reading-Glasses.html")).toBeNull();
    expect(videoChannelUrlForProduct("https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/../../etc")).toBeNull();
    expect(videoChannelUrlForProduct(productUrl + "?source=other")).toBeNull();
  });

  it("accepts only an exact page link, matching heading, MOQ and published teaser", () => {
    const evidence = extractVideoChannelAdvertisedPriceRange(
      videoHtml(), productUrl, videoUrl, "1200", "0.50",
    );
    expect(evidence).toEqual({
      lowPrice: "0.50",
      highPrice: "2.00",
      currency: "USD",
      unit: "Piece",
      evidence: "MATCHED_VIDEO_CHANNEL",
      sourceUrl: productUrl,
      evidenceUrl: videoUrl,
    });
  });

  it("rejects a sibling SKU, different product name or mismatched page URL", () => {
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml({ link: otherUrl }), productUrl, videoUrl, "1200", "0.50",
    )).toBeNull();
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml({ heading: "What is a Different Product" }), productUrl, videoUrl, "1200", "0.50",
    )).toBeNull();
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml(), productUrl, videoUrl + "?redirect=1", "1200", "0.50",
    )).toBeNull();
  });

  it("rejects different MOQ, different teaser or missing source price", () => {
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml(), productUrl, videoUrl, "300", "0.50",
    )).toBeNull();
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml(), productUrl, videoUrl, "1200", "0.18",
    )).toBeNull();
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml({ price: "1,200 Pieces US$0.50 / Piece" }),
      productUrl, videoUrl, "1200", "0.50",
    )).toBeNull();
    expect(extractVideoChannelAdvertisedPriceRange(
      videoHtml(), productUrl, videoUrl, null, "0.50",
    )).toBeNull();
  });

  it("does not use a related-products price that lacks explicit primary FOB price evidence", () => {
    const html = videoHtml({ price: "Contact for Price" }) +
      "<div>People who viewed this also viewed: 1,200 Pieces US$0.50-2.00 / Piece</div>";
    expect(extractVideoChannelAdvertisedPriceRange(
      html, productUrl, videoUrl, "1200", "0.50",
    )).toBeNull();
  });

  it("does not make a second network request unless explicitly enabled", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(primaryHtml(), { status: 200, headers: { "content-type": "text/html" } }));
    const result = await previewProductUrl(productUrl, { fetcher: fetcher as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.advertisedPriceRange).toBeNull();
    expect(result.minimumOrderQuantity).toBe("1200");
  });

  it("enriches only the read-only preview using same-SKU corroboration when opted in", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      expect(init?.redirect).toBe("manual");
      if (target === productUrl) return new Response(primaryHtml(), { status: 200, headers: { "content-type": "text/html" } });
      if (target === videoUrl) return new Response(videoHtml(), { status: 200, headers: { "content-type": "text/html" } });
      throw new Error("Unexpected URL " + target);
    });
    const result = await previewProductUrl(productUrl, {
      fetcher: fetcher as typeof fetch,
      verifyVideoPriceRange: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map((x) => String(x[0]))).toEqual([productUrl, videoUrl]);
    expect(result.minimumOrderQuantity).toBe("1200");
    expect(result.price).toBe("0.50");
    expect(result.advertisedPriceRange).toMatchObject({
      lowPrice: "0.50", highPrice: "2.00", evidenceUrl: videoUrl,
    });
  });

  it("fails closed on video redirect/404 rather than returning a fabricated range", async () => {
    for (const code of [302, 404]) {
      const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(String(input) === productUrl ? primaryHtml() : "Page not found", {
          status: String(input) === productUrl ? 200 : code,
          headers: { "content-type": "text/html" },
        }));
      const result = await previewProductUrl(productUrl, {
        fetcher: fetcher as typeof fetch, verifyVideoPriceRange: true,
      });
      expect(result.minimumOrderQuantity).toBe("1200");
      expect(result.advertisedPriceRange).toBeNull();
    }
  });

  it("does not attach 0.18–0.53 ranges to Dilicin based on unrelated cards", () => {
    const dilicinUrl =
      "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
    const video = videoChannelUrlForProduct(dilicinUrl);
    const html = '<html><head><meta property="og:title" content="New Model Senior Reading Glasses"></head>' +
      '<body><h1>New Model Senior Reading Glasses</h1><div>US$0.18</div>' +
      '<div>1,200 Pieces (MOQ)</div><section>People also viewed US$0.18-0.53 / Piece</section></body></html>';
    const preview = parseProductPreview(html, dilicinUrl);
    expect(preview.minimumOrderQuantity).toBe("1200");
    if (video) expect(extractVideoChannelAdvertisedPriceRange(
      '<h1>What is New Model Senior Reading Glasses</h1><p>1,200 Pieces US$0.18-0.53 / Piece</p>',
      dilicinUrl, video, preview.minimumOrderQuantity, preview.price,
    )).toBeNull();
  });
});
