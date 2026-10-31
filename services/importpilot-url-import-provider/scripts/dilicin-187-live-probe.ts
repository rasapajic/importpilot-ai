/**
 * #187 isolated, single-URL public-source acceptance probe.
 * Does not use a database, application account, provider tokens or supplier API.
 * Exactly one GET to the URL stored in the read-only staging cache; no redirects,
 * retries, proxy bypasses, messaging, scraping loops or writes.
 */
import { parseProductPreview } from "../src/parser.js";

const EXPECTED_URL =
  "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const REQUESTED_QUANTITY = 1000;
// These come from different observations and must not be conflated.
const UI_OBSERVED_MOQ = 200; // user's earlier staging screenshot
const STAGING_DATABASE_CACHE_MOQ = 1200; // read-only staging-cache inspection
const MAX_BYTES = 1_000_000;

function report(status: string, extra: Record<string, string | number | boolean | null> = {}) {
  const payload = {
    test: "JAKOV360-187-DILICIN-STAGING-CACHE-URL",
    status,
    checkedAt: new Date().toISOString(),
    productUrl: EXPECTED_URL,
    buyerQuantity: REQUESTED_QUANTITY,
    observedUiMoq: UI_OBSERVED_MOQ,
    stagingDatabaseCachedMoq: STAGING_DATABASE_CACHE_MOQ,
    ...extra,
  };
  const line = JSON.stringify(payload);
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    void import("node:fs/promises").then(({ appendFile }) =>
      appendFile(process.env.GITHUB_STEP_SUMMARY!, `### #187 — isolated real-source read\n\n\`\`\`json\n${line}\n\`\`\`\n\nNo database, supplier messaging or staging access.\n`),
    ).catch(() => undefined);
  }
}

async function main() {
  try {
    const res = await fetch(EXPECTED_URL, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      report("NOT_VERIFIED_REDIRECT", { httpStatus: res.status, sameSku: false });
      process.exitCode = 2;
      return;
    }
    if (!res.ok) {
      report("NOT_VERIFIED_HTTP_ERROR", { httpStatus: res.status });
      process.exitCode = 2;
      return;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      report("NOT_VERIFIED_CONTENT_TYPE", { httpStatus: res.status });
      process.exitCode = 2;
      return;
    }
    const length = Number(res.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      report("NOT_VERIFIED_OVERSIZED");
      process.exitCode = 2;
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      report("NOT_VERIFIED_EMPTY");
      process.exitCode = 2;
      return;
    }
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        report("NOT_VERIFIED_OVERSIZED");
        process.exitCode = 2;
        return;
      }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const visible = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\s+/g, " ");
    // Only an explicit listing MOQ marker; no trial 12 per color,
    // shipping/lead-time numbers or embedded JS assumed to be seller MOQ.
    const listing = visible.match(/\b([0-9]{1,3}(?:[,\s\u00a0][0-9]{3})+|[0-9]+)\s*(?:pieces?|pcs?|sets?|units?)\s*\(\s*MOQ\s*\)/i);
    if (!listing) {
      report("NOT_VERIFIED_NO_VISIBLE_LISTING_MOQ", { httpStatus: res.status, bytes });
      process.exitCode = 2;
      return;
    }
    const visibleMoq = Number(listing[1]!.replace(/[^0-9]/g, ""));
    const preview = parseProductPreview(html, EXPECTED_URL);
    const parsedMoq = Number(preview.minimumOrderQuantity);
    const titleMatches = /senior/i.test(preview.productTitle ?? "") &&
      /reading\s+glasses/i.test(preview.productTitle ?? "");
    if (!titleMatches || visibleMoq !== parsedMoq) {
      report("NOT_VERIFIED_IDENTITY_OR_PARSER", {
        httpStatus: res.status, titleMatches, visibleMoq, parsedMoq,
      });
      process.exitCode = 2;
      return;
    }
    report("VERIFIED_SOURCE_MOQ", {
      httpStatus: res.status, pageMoq: visibleMoq,
      differsFromStoredCache: visibleMoq !== STAGING_DATABASE_CACHE_MOQ,
      differsFromObservedUi: visibleMoq !== UI_OBSERVED_MOQ,
      aboveBuyerQuantity: visibleMoq > REQUESTED_QUANTITY,
      advertisedPriceForBuyerConfirmed: false,
    });
  } catch (error) {
    // No invented page contents on CAPTCHA, timeout, DNS or parsing failure.
    report("NOT_VERIFIED_FETCH_OR_PARSE", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 2;
  }
}
await main();
