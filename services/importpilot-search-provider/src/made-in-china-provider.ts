import {
  supplierSearchResultsSchema,
  type SearchRequest,
  type SupplierSearchResult,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";
import type { SupplierSearchSource } from "./provider.js";
import { createSupplierSearchQueryVariants } from "./query-variants.js";

const SEARCH_URL = "https://www.made-in-china.com/products-search/hot-china-products";
const MULTI_SEARCH_URL = "https://www.made-in-china.com/multi-search";
const MAX_RESULTS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_DEBUG_HTML_BYTES = 300_000;
const PROVIDER_NAME = "made-in-china-v1";

type Options = {
  fetcher?: typeof fetch;
  userAgent?: string;
  maxResponseBytes?: number;
  logger?: DevelopmentLogger;
  debugHtml?: boolean;
  environment?: string;
  debugDirectory?: string;
  requestTimeoutMs?: number;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value: unknown, price: unknown) {
  const candidate = `${text(value) ?? ""} ${text(price) ?? ""}`.toUpperCase();
  if (/\bUSD\b|US\$|\$/.test(candidate)) return "USD";
  if (/\bEUR\b|€/.test(candidate)) return "EUR";
  if (/\bGBP\b|£/.test(candidate)) return "GBP";
  if (/\bCNY\b|\bRMB\b|CN¥|¥/.test(candidate)) return "CNY";
  return null;
}

function absoluteHttpsUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate, "https://www.made-in-china.com");
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function nearbyText(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match ? plainText(match[1] ?? "") : null;
}

function cardBlocks(html: string) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["']list-node(?:\s[^"']*)?["'][^>]*>/gi)]
    .map((match) => match.index ?? 0);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function relatedCardBlocks(html: string) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["']list-img(?:\s[^"']*)?["'][^>]*>/gi)]
    .map((match) => match.index ?? 0);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function productNameCardBlocks(html: string) {
  const starts = [...html.matchAll(/<h2\b[^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index ?? 0);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function storefrontName(productUrl: string | null) {
  if (!productUrl) return null;
  try {
    const hostname = new URL(productUrl).hostname;
    return hostname.endsWith(".made-in-china.com") ? hostname : null;
  } catch {
    return null;
  }
}

function first(record: Record<string, unknown>, keys: string[]) {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(records)];
}

function payloads(html: string) {
  return [...html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        return [JSON.parse(match[1] ?? "") as unknown];
      } catch {
        return [];
      }
    });
}

function normalize(record: Record<string, unknown>): SupplierSearchResult | null {
  const title = text(first(record, ["title", "productName", "name"]));
  const supplierName = text(first(record, ["supplierName", "companyName", "supplier"]));
  const productUrl = absoluteHttpsUrl(first(record, ["productUrl", "detailUrl", "url"]));
  if (!title || !supplierName || !productUrl || !productUrl.includes("made-in-china.com")) return null;

  const rawPrice = first(record, ["price", "priceText", "unitPrice"]);
  const parsedPrice = number(rawPrice);
  const parsedCurrency = currency(first(record, ["currency", "currencyCode"]), rawPrice);
  const rawMoq = number(first(record, ["minimumOrderQuantity", "moq", "minOrder"]));
  const rawCountry = text(first(record, ["supplierCountry", "countryCode"]))?.toUpperCase();
  const rawIncoterm = text(first(record, ["incoterm", "tradeTerms"]))?.toUpperCase();

  return {
    title,
    supplierName,
    supplierCountry: rawCountry && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null,
    price: parsedPrice !== null && parsedCurrency ? parsedPrice : null,
    currency: parsedPrice !== null && parsedCurrency ? parsedCurrency : null,
    minimumOrderQuantity: rawMoq && Number.isInteger(rawMoq) ? rawMoq : null,
    incoterm: rawIncoterm?.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/)?.[1] ?? null,
    productUrl,
    imageUrl: absoluteHttpsUrl(first(record, ["imageUrl", "image", "mainImage"])),
    source: "Made-in-China",
  };
}

function htmlCardRecords(html: string) {
  return cardBlocks(html)
    .map((card) => {
      const productAnchor = card.match(
        /<h2\b[^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i,
      );
      const imageTag = card.match(/<img\b[^>]*data-original=["'][^"']+["'][^>]*>/i)?.[0] ??
        card.match(/<img\b[^>]*data-src=["'][^"']+["'][^>]*>/i)?.[0] ??
        card.match(/<img\b[^>]*src=["'][^"']*image\.made-in-china\.com[^"']*["'][^>]*>/i)?.[0] ??
        "";
      return {
        title: plainText(productAnchor?.[2] ?? "") || text(attribute(productAnchor?.[1] ?? "", "title")),
        supplierName: nearbyText(
          card,
          /<span\b[^>]*class=["'][^"']*\bcompnay-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        ) ?? nearbyText(
          card,
          /<(?:a|span)\b[^>]*class=["'][^"']*(?:company-name|supplier-name|companyName)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span)>/i,
        ),
        priceText: nearbyText(card, /class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i),
        moq: nearbyText(card, /Min\.\s*Order:\s*<span[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i),
        tradeTerms: plainText(card),
        productUrl: attribute(productAnchor?.[1] ?? "", "href"),
        imageUrl: attribute(imageTag, "data-original") ??
          attribute(imageTag, "data-src") ??
          attribute(imageTag, "src"),
      };
    });
}

function relatedCardRecords(html: string) {
  return relatedCardBlocks(html).map((card) => {
    const productAnchor = card.match(
      /<a\b([^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i,
    );
    const productUrl = absoluteHttpsUrl(attribute(productAnchor?.[1] ?? "", "href"));
    const imageTag = card.match(/<img\b[^>]*data-original=["'][^"']+["'][^>]*>/i)?.[0] ?? "";
    return {
      title: text(attribute(productAnchor?.[1] ?? "", "title")) ?? plainText(productAnchor?.[2] ?? ""),
      supplierName: storefrontName(productUrl),
      priceText: nearbyText(card, /class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i),
      moq: nearbyText(card, /Min\.\s*Order:\s*<\/b>\s*([\d,.]+)/i),
      tradeTerms: plainText(card),
      productUrl,
      imageUrl: attribute(imageTag, "data-original"),
    };
  });
}

function productNameCardRecords(html: string) {
  return productNameCardBlocks(html).map((card) => {
    const productHeading = card.match(
      /<h2\b([^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*)>([\s\S]*?)<\/h2>/i,
    );
    const productAnchor = productHeading?.[2]?.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const imageTag = card.match(/<img\b[^>]*data-original=["'][^"']+["'][^>]*>/i)?.[0] ?? "";
    return {
      title: text(attribute(productHeading?.[1] ?? "", "title")) ?? plainText(productAnchor?.[2] ?? ""),
      supplierName: nearbyText(
        card,
        /<a\b[^>]*class=["'][^"']*\bcompnay-name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      ),
      priceText: nearbyText(
        card,
        /<strong\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i,
      ),
      moq: nearbyText(
        card,
        /<div\b[^>]*class=["'][^"']*\binfo\b[^"']*["'][^>]*>\s*([\d,.]+)[\s\S]*?<span\b[^>]*class=["'][^"']*\bprice_hint\b[^"']*["'][^>]*>\s*\(MOQ\)\s*<\/span>/i,
      ),
      tradeTerms: plainText(card),
      productUrl: attribute(productAnchor?.[1] ?? "", "href"),
      imageUrl: attribute(imageTag, "data-original"),
    };
  });
}

export function parseMadeInChinaSearchHtml(html: string) {
  const seen = new Set<string>();
  const results = [
    ...payloads(html).flatMap(records),
    ...htmlCardRecords(html),
    ...relatedCardRecords(html),
    ...productNameCardRecords(html),
  ]
    .map(normalize)
    .filter((result): result is SupplierSearchResult => result !== null)
    .filter((result) => {
      if (seen.has(result.productUrl)) return false;
      seen.add(result.productUrl);
      return true;
    })
    .slice(0, MAX_RESULTS);
  return supplierSearchResultsSchema.max(MAX_RESULTS).parse(results);
}

async function saveDebugHtml(
  html: string,
  directory: string,
  logger: DevelopmentLogger,
) {
  const filePath = join(directory, `importpilot-made-in-china-${Date.now()}.html`);
  const preview = Buffer.from(html, "utf8").subarray(0, MAX_DEBUG_HTML_BYTES);
  try {
    await writeFile(filePath, preview);
    logger("debug_html_saved", {
      provider_name: PROVIDER_NAME,
      html_saved: true,
      file_path: filePath,
    });
  } catch {
    logger("debug_html_saved", {
      provider_name: PROVIDER_NAME,
      html_saved: false,
    });
  }
}

function isBlocked(html: string, status: number) {
  return status === 403 || status === 429 ||
    /captcha|verify you are human|access denied|unusual traffic/i.test(html);
}

function emptyResultReason(html: string, responseUrl: string) {
  if (/window\.location|location\.href|http-equiv=["']refresh/i.test(html)) {
    return "Made-in-China returned a redirect page instead of search results.";
  }
  if (
    /<div\b[^>]*class=["'][^"']*\bprod-list\b/i.test(html) ||
    /\b0\s+Products?\s+found\b|no products? found|no matching products?/i.test(html)
  ) {
    return "Made-in-China returned a search page with no usable product results.";
  }
  if (
    !/<(?:div|h2)\b[^>]*class=["'][^"']*(?:\blist-node\b|\bproduct-name\b)/i.test(html) &&
    /<script\b/i.test(html)
  ) {
    return "Made-in-China returned a JavaScript-only page without server-rendered results.";
  }
  if (!responseUrl.includes("made-in-china.com")) {
    return "Made-in-China redirected the search request outside the provider.";
  }
  return "Made-in-China returned no parseable supplier offers.";
}

function searchAttempts(productQuery: string) {
  const variants = createSupplierSearchQueryVariants(productQuery);
  const hot = variants.map((query) => ({
    query,
    strategy: "hot-products",
    url: new URL(`${SEARCH_URL}/${encodeURIComponent(query)}.html`),
  }));
  const direct = variants.slice(1).map((query) => ({
    query,
    strategy: "multi-search",
    url: new URL(`${MULTI_SEARCH_URL}/${encodeURIComponent(query).replaceAll("%20", "+")}/F1/1.html`),
  }));
  return [...hot, ...direct].slice(0, 5);
}

export function createMadeInChinaSupplierSearchSource({
  fetcher = fetch,
  userAgent = "Mozilla/5.0 (compatible; ImportPilotSearchProvider/1.0)",
  maxResponseBytes = MAX_RESPONSE_BYTES,
  logger = createDevelopmentLogger(),
  debugHtml = process.env.SEARCH_PROVIDER_DEBUG_HTML === "true",
  environment = process.env.NODE_ENV,
  debugDirectory = tmpdir(),
  requestTimeoutMs = 7_000,
}: Options = {}): SupplierSearchSource {
  return {
    name: PROVIDER_NAME,
    implemented: true,

    async healthCheck(signal) {
      try {
        return (await fetcher("https://www.made-in-china.com/", {
          headers: { "user-agent": userAgent },
          signal,
        })).ok;
      } catch {
        return false;
      }
    },

    async search(input: SearchRequest, signal: AbortSignal) {
      let finalReason = "Made-in-China returned no parseable supplier offers.";
      const attempts = searchAttempts(input.productQuery);
      for (const [variantIndex, attempt] of attempts.entries()) {
        const { query, strategy, url } = attempt;
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
        logger("query_variant_attempt", {
          provider_name: PROVIDER_NAME,
          query_variant: query,
          search_strategy: strategy,
          variant_index: variantIndex,
        });
        logger("upstream_request", { provider_name: PROVIDER_NAME, upstreamUrl: url.href });
        let response: Response;
        try {
          response = await fetcher(url, {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "accept-language": input.language === "de" ? "de-DE,de;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
              "user-agent": userAgent,
            },
            redirect: "follow",
            signal: requestSignal,
          });
        } catch (error) {
          finalReason = requestSignal.aborted
            ? "Made-in-China query variant timed out."
            : "Made-in-China query variant request failed.";
          logger("query_variant_failed", {
            provider_name: PROVIDER_NAME,
            query_variant: query,
            reason: finalReason,
            error_name: error instanceof Error ? error.name : "unknown",
            error_message: error instanceof Error ? error.message : "unknown",
            error_cause: error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
          });
          continue;
        }
        logger("upstream_response", { provider_name: PROVIDER_NAME, upstream_status: response.status });
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > maxResponseBytes) {
          finalReason = "Made-in-China response was too large to parse safely.";
          continue;
        }
        const html = await response.text();
        if (debugHtml && environment === "development") {
          await saveDebugHtml(html, debugDirectory, logger);
        }
        const blocked = isBlocked(html, response.status);
        logger("upstream_block_detection", { provider_name: PROVIDER_NAME, blocked });
        if (Buffer.byteLength(html, "utf8") > maxResponseBytes) {
          finalReason = "Made-in-China response was too large to parse safely.";
          continue;
        }
        if (!response.ok || blocked) {
          finalReason = "Made-in-China blocked or rejected the search request.";
          continue;
        }
        try {
          const results = parseMadeInChinaSearchHtml(html);
          logger("upstream_parse_complete", { provider_name: PROVIDER_NAME, parsed_results: results.length });
          if (results.length) {
            logger("query_variant_success", {
              provider_name: PROVIDER_NAME,
              query_variant: query,
              search_strategy: strategy,
              parsed_results: results.length,
            });
            return { results };
          }
          finalReason = emptyResultReason(html, response.url || url.href);
        } catch {
          finalReason = "Made-in-China search results could not be parsed.";
        }
      }
      logger("upstream_parse_complete", { provider_name: PROVIDER_NAME, parsed_results: 0 });
      logger("provider_empty_reason", { provider_name: PROVIDER_NAME, reason: finalReason });
      return { results: [], reason: finalReason };
    },
  };
}
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
