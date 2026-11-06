/**
 * JAKOV360 #199 — independent second-supplier factual source check.
 *
 * Read-only, at most TWO GETs: correct Dilicn main exact SKU and derived
 * exact-SKU video. No cookies, credentials, retries, redirects, auto-queries,
 * saved HTML, seller contact, Render configuration or production writes.
 * Logs bounded public metadata only, never raw HTML.
 */
import {
  exactMadeInChinaProductIdentity,
  discoverExactSellerCatalogUrl,
  expectedVideoSourceUrl,
  parseExactVideoPriceSource,
} from "../services/importpilot-url-import-provider/src/marketplace-price-source-parser.js";
import { parseProductPreview } from "../services/importpilot-url-import-provider/src/parser.js";

const PRODUCT =
  "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const VIDEO =
  "https://www.made-in-china.com/video-channel/dilicn_jYzpeDtbEMkd_New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const identity = exactMadeInChinaProductIdentity(PRODUCT);
const note = (event: string, data: Record<string, unknown> = {}) =>
  console.info(JSON.stringify({ event, ...data }));

async function boundedExactGet(url: string, limit: number) {
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 7000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: aborter.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; JAKOV360 read-only source validation)",
      },
    });
    const exact = response.url === url && response.redirected === false;
    const mime = (response.headers.get("content-type") ?? "").toLowerCase().split(";")[0];
    note("http_status", {
      source: url === PRODUCT ? "MAIN_PRODUCT" : "EXACT_VIDEO",
      http: response.status, finalUrlExact: exact, contentType: mime,
    });
    if (response.status !== 200 || !exact ||
        (mime !== "text/html" && mime !== "application/xhtml+xml") || !response.body) return null;
    const contentLength = response.headers.get("content-length");
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) return null;

    const stream = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";
    try {
      while (true) {
        const chunk = await stream.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) {
          await stream.cancel();
          return null;
        }
        html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      stream.releaseLock();
    }
    return { html, bytes };
  } catch (error) {
    note("source_unavailable", {
      source: url === PRODUCT ? "MAIN_PRODUCT" : "EXACT_VIDEO",
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function primaryVideoSinglePrice(html: string) {
  // Diagnostic ONLY: do not promote an extracted fixed amount to a range.
  // Scope to the FIRST main-price block before recommendation cards.
  const plain = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
  const marker = "Min. Order Reference FOB Price";
  const i = plain.toLowerCase().indexOf(marker.toLowerCase());
  if (i < 0) return null;
  const section = plain.slice(i, i + 135);
  const result = section.match(
    /Min\.?\s*Order\s+Reference\s+FOB\s+Price\s*:?\s*([\d,]+)\s*(?:Pieces?|pcs)\s+US\s*\$\s*(\d+(?:\.\d{1,4})?)\s*\/\s*Piece\b/i,
  );
  if (!result) return null;
  const moq = Number(result[1].replaceAll(",", ""));
  const price = Number(result[2]);
  return Number.isSafeInteger(moq) && moq > 0 && Number.isFinite(price) && price > 0
    ? { moq, publicSinglePriceUsd: price }
    : null;
}

async function run() {
  if (!identity || identity.seller !== "dilicn" ||
      identity.sku !== "jYzpeDtbEMkd" ||
      expectedVideoSourceUrl(PRODUCT) !== VIDEO) throw new Error("Local exact SKU identity check failed");
  note("identity", {
    seller: identity.seller,
    sku: identity.sku,
    derivedVideoUrlExact: true,
  });

  const main = await boundedExactGet(PRODUCT, 900_000);
  if (!main) {
    note("result", { status: "MAIN_PAGE_UNAVAILABLE", claim: "NO_AUTOMATIC_PRICE_EVIDENCE" });
    return;
  }
  let preview = null;
  try { preview = parseProductPreview(main.html, PRODUCT); }
  catch (error) { note("primary_parse_failure", { type: error instanceof Error ? error.name : "unknown" }); }
  note("main_product", {
    bytes: main.bytes,
    sourceTitleMatch: /New Model Senior Reading Glasses High[- ]Definition Wholesale From Manufacturers Direct Sales/i.test(main.html),
    supplier: preview?.supplierName ?? null,
    teaserUsd: preview?.price ?? null,
    extractedMoq: preview?.minimumOrderQuantity ?? null,
    currency: preview?.currency ?? null,
    discoveredCatalog: Boolean(discoverExactSellerCatalogUrl(main.html, PRODUCT)),
    catalogLinkCandidates: (main.html.match(/product-group\//gi) ?? []).length,
    faqMentions12PcsPerColor: /12\s*(?:pcs|pieces)\s*per\s*color/i.test(main.html),
  });

  const video = await boundedExactGet(VIDEO, 390_000);
  if (!video) {
    note("result", {
      status: "EXACT_VIDEO_UNAVAILABLE_OR_BLOCKED",
      claim: "NO_SECOND_SOURCE_CONFIRMATION",
    });
    return;
  }
  const single = primaryVideoSinglePrice(video.html);
  const range = parseExactVideoPriceSource(video.html, PRODUCT, VIDEO);
  note("video_exact_sku", {
    bytes: video.bytes,
    singlePrice: single,
    parserReturnsRange: Boolean(range),
    allowedToShowPublicRange: false,
    writtenSupplierQuote: false,
  });
  if (range) throw new Error("Single-price video unexpectedly promoted to range");
  note("result", {
    status: single && single.moq === 1200 && single.publicSinglePriceUsd === 0.18
      ? "SINGLE_PUBLIC_PRICE_FOUND_WITHOUT_RANGE"
      : "VIDEO_PRICE_NOT_ESTABLISHED",
    claim: "PUBLIC_SINGLE_PRICE_NOT_A_QUOTE",
  });
}

void run().catch((err) => {
  note("probe_error", { type: err instanceof Error ? err.name : "unknown" });
  process.exitCode = 1;
});
