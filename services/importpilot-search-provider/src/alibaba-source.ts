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

const ALIBABA_SEARCH_URL = "https://www.alibaba.com/trade/search";
const MAX_RESULTS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;

type AlibabaSourceOptions = {
  fetcher?: typeof fetch;
  userAgent?: string;
  maxResponseBytes?: number;
  logger?: DevelopmentLogger;
  requestTimeoutMs?: number;
};

const currencySymbols: Array<[RegExp, string]> = [
  [/\bUS\$/i, "USD"],
  [/\bUSD\b/i, "USD"],
  [/\$/i, "USD"],
  [/\bEUR\b/i, "EUR"],
  [/€/i, "EUR"],
  [/\bGBP\b/i, "GBP"],
  [/£/i, "GBP"],
  [/\bCNY\b|\bRMB\b|\bCN¥\b/i, "CNY"],
  [/¥/i, "CNY"],
];

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value: unknown, priceText: unknown) {
  const explicit = text(value)?.toUpperCase();
  if (explicit && /^[A-Z]{3}$/.test(explicit)) return explicit;
  const candidate = `${text(value) ?? ""} ${text(priceText) ?? ""}`;
  return currencySymbols.find(([pattern]) => pattern.test(candidate))?.[1] ?? null;
}

function absoluteUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const normalized = candidate.startsWith("//") ? `https:${candidate}` : candidate;
    const url = new URL(normalized, "https://www.alibaba.com");
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function incoterm(value: unknown) {
  const candidate = text(value)?.toUpperCase();
  return candidate?.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/)?.[1] ?? null;
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

function jsonPayloads(html: string) {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  return blocks.flatMap((match) => {
    try {
      return [JSON.parse(match[1] ?? "") as unknown];
    } catch {
      return [];
    }
  });
}

function normalizeRecord(record: Record<string, unknown>): SupplierSearchResult | null {
  const title = text(first(record, ["title", "subject", "productTitle", "name"]));
  const supplierName = text(first(record, ["supplierName", "companyName", "supplier", "sellerName"]));
  const productUrl = absoluteUrl(first(record, ["productUrl", "detailUrl", "url", "href"]));
  if (!title || !supplierName || !productUrl || !productUrl.includes("alibaba.com")) return null;

  const priceText = first(record, ["price", "priceText", "fobPrice", "promotionPrice"]);
  const parsedPrice = number(priceText);
  const parsedCurrency = currency(first(record, ["currency", "currencyCode"]), priceText);
  const validPrice = parsedPrice !== null && parsedCurrency !== null;
  const country = text(first(record, ["supplierCountry", "countryCode", "country"]))?.toUpperCase();
  const minimumOrderQuantity = number(first(record, ["minimumOrderQuantity", "moq", "minOrderQuantity", "minOrder"]));

  return {
    title,
    supplierName,
    supplierCountry: country && /^[A-Z]{2}$/.test(country) ? country : null,
    price: validPrice ? parsedPrice : null,
    currency: validPrice ? parsedCurrency : null,
    minimumOrderQuantity: minimumOrderQuantity && Number.isInteger(minimumOrderQuantity)
      ? minimumOrderQuantity
      : null,
    incoterm: incoterm(first(record, ["incoterm", "tradeTerms", "deliveryTerms"])),
    productUrl,
    imageUrl: absoluteUrl(first(record, ["imageUrl", "image", "imagePath", "mainImage"])),
    source: "Alibaba",
  };
}

export function parseAlibabaSearchHtml(html: string) {
  const seen = new Set<string>();
  const candidates = jsonPayloads(html)
    .flatMap(records)
    .map(normalizeRecord)
    .filter((result): result is SupplierSearchResult => result !== null)
    .filter((result) => {
      if (seen.has(result.productUrl)) return false;
      seen.add(result.productUrl);
      return true;
    })
    .slice(0, MAX_RESULTS);
  return supplierSearchResultsSchema.max(MAX_RESULTS).parse(candidates);
}

function blocked(html: string, status: number) {
  return status === 403 ||
    status === 429 ||
    /captcha|verify you are human|access denied|unusual traffic/i.test(html);
}

export function createAlibabaSupplierSearchSource({
  fetcher = fetch,
  userAgent = "Mozilla/5.0 (compatible; ImportPilotSearchProvider/1.0)",
  maxResponseBytes = MAX_RESPONSE_BYTES,
  logger = createDevelopmentLogger(),
  requestTimeoutMs = 4_000,
}: AlibabaSourceOptions = {}): SupplierSearchSource {
  return {
    name: "alibaba-v1",
    implemented: true,

    async healthCheck(signal) {
      try {
        const response = await fetcher("https://www.alibaba.com/", {
          method: "GET",
          headers: { "user-agent": userAgent },
          signal,
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async search(input: SearchRequest, signal: AbortSignal) {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
      const url = new URL(ALIBABA_SEARCH_URL);
      url.searchParams.set("SearchText", input.productQuery);
      logger("upstream_request", { provider_name: "alibaba-v1", upstreamUrl: url.href });
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": input.language === "de" ? "de-DE,de;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
          "user-agent": userAgent,
        },
        redirect: "follow",
        signal: requestSignal,
      });
      logger("upstream_response", {
        provider_name: "alibaba-v1",
        upstream_status: response.status,
      });
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > maxResponseBytes) {
        logger("upstream_block_detection", { provider_name: "alibaba-v1", blocked: false });
        logger("upstream_parse_complete", { provider_name: "alibaba-v1", parsed_results: 0 });
        return { results: [], reason: "Alibaba response was too large to parse safely." };
      }
      const html = await response.text();
      if (Buffer.byteLength(html, "utf8") > maxResponseBytes) {
        logger("upstream_block_detection", { provider_name: "alibaba-v1", blocked: false });
        logger("upstream_parse_complete", { provider_name: "alibaba-v1", parsed_results: 0 });
        return { results: [], reason: "Alibaba response was too large to parse safely." };
      }
      const blockedOrCaptcha = blocked(html, response.status);
      logger("upstream_block_detection", { provider_name: "alibaba-v1", blocked: blockedOrCaptcha });
      if (!response.ok || blockedOrCaptcha) {
        logger("upstream_parse_complete", { provider_name: "alibaba-v1", parsed_results: 0 });
        return { results: [], reason: "Alibaba blocked or rejected the search request." };
      }
      try {
        const results = parseAlibabaSearchHtml(html);
        logger("upstream_parse_complete", { provider_name: "alibaba-v1", parsed_results: results.length });
        return results.length
          ? { results }
          : { results: [], reason: "Alibaba returned no parseable supplier offers." };
      } catch {
        logger("upstream_parse_complete", { provider_name: "alibaba-v1", parsed_results: 0 });
        return { results: [], reason: "Alibaba search results could not be parsed." };
      }
    },
  };
}
