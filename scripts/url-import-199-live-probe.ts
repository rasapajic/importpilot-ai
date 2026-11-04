/**
 * Read-only live source probe for JAKOV360 #199.
 *
 * CI ONLY: fixed public Pilot Optics URLs; no auth, secrets, writes, RFQs,
 * stored HTML or product creation. Logs metadata/reason codes, NOT page HTML.
 * This script is not included in the runtime service's build or startup.
 */
import {
  discoverExactSellerCatalogUrl,
  expectedVideoSourceUrl,
} from "../services/importpilot-url-import-provider/src/marketplace-price-source-parser.ts";
import {
  readCorroboratedMarketplacePrice,
} from "../services/importpilot-url-import-provider/src/marketplace-price-source-reader.ts";

const PRODUCT_URL =
  "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const EXPECTED_VIDEO =
  "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const EXPECTED_CATALOG =
  "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";

const summary = (event: string, fields: Record<string, unknown>) =>
  console.info(JSON.stringify({ event, ...fields }));

function sameExactUrl(response: Response, requested: string) {
  return !response.redirected && response.status === 200 && response.url === requested;
}

async function productHtml() {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(PRODUCT_URL, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
    });
    summary("original_product_response", {
      status: response.status,
      exact: sameExactUrl(response, PRODUCT_URL),
      mime: response.headers.get("content-type")?.split(";")[0] ?? null,
    });
    if (!sameExactUrl(response, PRODUCT_URL) ||
        !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")) return null;
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 900_000)) return null;
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 900_000) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) {
      body.set(part, offset);
      offset += part.length;
    }
    const html = new TextDecoder().decode(body);
    summary("original_product_html", {
      bytes,
      catalogAnchorCandidates: (html.match(/product-group\//g) ?? []).length,
      sourceLinked: html.includes("WJfUCnDTuekA"),
    });
    return html;
  } catch (error) {
    summary("original_product_error", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

const html = await productHtml();
if (!html) {
  summary("live_probe", { result: "UNAVAILABLE_OR_BLOCKED", requests: 1 });
  process.exitCode = 2;
} else {
  const discovered = discoverExactSellerCatalogUrl(html, PRODUCT_URL);
  const videoUrl = expectedVideoSourceUrl(PRODUCT_URL);
  summary("source_discovery", {
    exactVideoUrl: videoUrl === EXPECTED_VIDEO,
    catalogFound: Boolean(discovered),
    expectedCatalogMatched: discovered === EXPECTED_CATALOG,
  });

  let requests = 0;
  const observer: typeof fetch = async (url, init) => {
    requests++;
    const target = String(url);
    const source = target === EXPECTED_VIDEO ? "VIDEO_CHANNEL"
      : target === EXPECTED_CATALOG ? "SUPPLIER_CATALOG" : "UNEXPECTED";
    if (source === "UNEXPECTED") throw new Error("Untrusted source request");
    const response = await fetch(url, init);
    summary("source_response", {
      source,
      status: response.status,
      exact: response.url === target && !response.redirected,
      mime: response.headers.get("content-type")?.split(";")[0] ?? null,
      declaredBytes: response.headers.get("content-length"),
    });
    return response;
  };

  const result = await readCorroboratedMarketplacePrice(PRODUCT_URL, html, {
    enabled: true,
    fetcher: observer,
    timeoutMs: 7_000,
    maxResponseBytes: 380_000,
  });

  summary("live_probe", {
    result: result ? "PUBLIC_RANGE_CORROBORATED" : "NO_CONFIRMED_SOURCE_PAIR",
    requests: requests + 1,
    low: result?.lowPrice ?? null,
    high: result?.highPrice ?? null,
    currency: result?.currency ?? null,
    moq: result?.minimumOrderQuantity ?? null,
    verifiedQuote: result?.verifiedQuote ?? false,
    sources: result?.evidence.length ?? 0,
  });
  if (!result) process.exitCode = 1;
}
