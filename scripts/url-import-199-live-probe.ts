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
  parseExactCatalogPriceSource,
} from "../services/importpilot-url-import-provider/src/marketplace-price-source-parser.js";
import {
  readCorroboratedMarketplacePrice,
  readSingleCatalogAdvertisedRange,
} from "../services/importpilot-url-import-provider/src/marketplace-price-source-reader.js";
import { parseProductPreview } from "../services/importpilot-url-import-provider/src/parser.js";

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

async function runProbe() {
const html = await productHtml();
if (!html) {
  summary("live_probe", { result: "UNAVAILABLE_OR_BLOCKED", requests: 1 });
  process.exitCode = 2;
} else {
  const discovered = discoverExactSellerCatalogUrl(html, PRODUCT_URL);
  const videoUrl = expectedVideoSourceUrl(PRODUCT_URL);
  if (!discovered) {
    // Metadata only. Do not print a downloaded page or dump arbitrary HTML.
    const hints = [...html.matchAll(/product-group\/[a-zA-Z0-9%/_\-\.]{1,160}/g)]
      .map(match => (match[0] ?? "").slice(0, 155))
      .filter((s, i, all) => all.indexOf(s) === i)
      .slice(0, 24);
    const anchors = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']{1,500})\1[^>]*>([\s\S]{0,500}?)<\/a>/gi)]
      .filter(match => /product-group\//i.test(match[2] ?? ""))
      .slice(0, 15)
      .map(match => ({ href: (match[2] ?? "").slice(0, 180),
        text: (match[3] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) }));
    summary("catalog_discovery_diagnostics", { hints, anchors });
  }
  summary("source_discovery", {
    exactVideoUrl: videoUrl === EXPECTED_VIDEO,
    catalogFound: Boolean(discovered),
    expectedCatalogMatched: discovered === EXPECTED_CATALOG,
  });

  let requests = 0;
  let videoHttpStatus: number | null = null;
  let catalogVerified = false;
  const observer: typeof fetch = async (url, init) => {
    requests++;
    const target = String(url);
    const source = target === EXPECTED_VIDEO ? "VIDEO_CHANNEL"
      : target === EXPECTED_CATALOG ? "SUPPLIER_CATALOG" : "UNEXPECTED";
    if (source === "UNEXPECTED") throw new Error("Untrusted source request");
    const response = await fetch(url, init);
    if (source === "VIDEO_CHANNEL") videoHttpStatus = response.status;
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

  // A video 403 never establishes two-source corroboration. Independently
  // check a single catalog against the already parsed primary product MOQ.
  if (!result && discovered === EXPECTED_CATALOG) {
    try {
      const primary = parseProductPreview(html, PRODUCT_URL);
      const primaryMoq = Number(primary.minimumOrderQuantity);
      const catalogObservation = await readSingleCatalogAdvertisedRange(
        PRODUCT_URL, html, primaryMoq, {
          enabled: true, fetcher: observer,
          timeoutMs: 7_000, maxResponseBytes: 380_000,
        },
      );
      catalogVerified = Boolean(catalogObservation);
      summary("catalog_only_diagnostic", {
        primaryMoq,
        matched: Boolean(catalogObservation),
        moq: catalogObservation?.minimumOrderQuantity ?? null,
        min: catalogObservation?.lowPrice ?? null,
        max: catalogObservation?.highPrice ?? null,
        corroborated: catalogObservation?.corroborated ?? false,
        verifiedQuote: catalogObservation?.verifiedQuote ?? false,
      });
    } catch (e) {
      summary("catalog_only_diagnostic", {
        errorClass: e instanceof Error ? e.name : "unknown",
      });
    }
  }

  summary("live_probe", {
    result: result ? "PUBLIC_RANGE_CORROBORATED" : "NO_CONFIRMED_SOURCE_PAIR",
    requests: requests + 1,
    low: result?.lowPrice ?? null,
    high: result?.highPrice ?? null,
    currency: result?.currency ?? null,
    moq: result?.minimumOrderQuantity ?? null,
    verifiedQuote: result?.verifiedQuote ?? false,
    sources: result?.evidence.length ?? 0,
    diagnostic: !result && videoHttpStatus === 403 && catalogVerified
      ? "VIDEO_403_CATALOG_VERIFIED_NO_CORROBORATION"
      : result ? "FULL_CORROBORATION" : "UNRESOLVED",
  });
  // A blocked video with a correctly parsed catalog is a successful
  // *fail-closed security diagnostic*, not a successful price corroboration.
  if (!result && !(videoHttpStatus === 403 && catalogVerified)) process.exitCode = 1;
}

}

void runProbe().catch((error) => {
  summary("live_probe_unexpected_error", { kind: error instanceof Error ? error.name : "unknown" });
  process.exitCode = 3;
});
