import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";

import {
  supplierOfferUrlImportRequestSchema,
  supplierOfferUrlPreviewSchema,
  type SupplierOfferUrlImportProvider,
  type SupplierOfferUrlPreview,
} from "../domain/search";

export const URL_IMPORT_TIMEOUT_MS = 8_000;
export const URL_IMPORT_MAX_RESPONSE_BYTES = 1_000_000;

let localEnvCache: Record<string, string> | null = null;

function localEnvValue(key: string) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) return process.env[key];
  if (!localEnvCache) {
    localEnvCache = {};
    if (existsSync(".env")) {
      for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separator = trimmed.indexOf("=");
        if (separator <= 0) continue;
        localEnvCache[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return localEnvCache[key];
}

export class UrlImportTimeoutError extends Error {}
export class UrlImportResponseTooLargeError extends Error {}
export class UrlImportFetchError extends Error {}
export class UrlImportUnsupportedUrlError extends Error {}
export class UrlImportMissingProductIdentifierError extends Error {}
export class UrlImportBlockedError extends Error {}
export class UrlImportParsingError extends Error {}
export class UrlImportExternalProviderError extends UrlImportFetchError {}

export type UrlImportProviderName = "alibaba" | "made-in-china";
type UrlImportDiagnostics = {
  provider: UrlImportProviderName | "unknown";
  url: string;
  validationResult: "valid" | "invalid";
  httpStatus?: number;
  parserResult?: "success" | "failure" | "blocked";
  finalReason?: string;
};

function previewFieldCount(preview: SupplierOfferUrlPreview) {
  return [
    preview.title,
    preview.supplierName,
    preview.price,
    preview.currency,
    preview.minimumOrderQuantity,
    preview.imageUrl,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function logDiagnostics(diagnostics: UrlImportDiagnostics) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[url-import]", JSON.stringify(diagnostics));
}

function logUrlImportFlow(diagnostics: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[url-import-flow]", JSON.stringify(diagnostics));
}

export function detectUrlImportProvider(url: URL): UrlImportProviderName | "unknown" {
  const host = url.hostname.toLowerCase();
  if (host === "alibaba.com" || host.endsWith(".alibaba.com")) return "alibaba";
  if (host === "made-in-china.com" || host.endsWith(".made-in-china.com")) return "made-in-china";
  return "unknown";
}

export function hasUrlProductIdentifier(provider: UrlImportProviderName, url: URL) {
  const value = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  if (provider === "alibaba") {
    return /product-detail|product\/|_\d+\.html|\/p-detail\//.test(value) || url.hostname.toLowerCase().startsWith("s.");
  }
  return /\/productdetail\/|\/product-detail\/|_[a-z0-9]+\.html|\/pd\//i.test(value);
}

export function isBlockedHtml(html: string) {
  return /captcha|anti[-\s]?bot|robot check|verify you are human|access denied|unusual traffic|security check/i.test(html);
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return isIP(host) === 6 && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"));
}

function decodeHtml(value: string | null | undefined) {
  return value
    ?.replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim() || null;
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  return decodeHtml(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean));
}

function regexText(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = decodeHtml(match?.[1]?.replace(/<[^>]+>/g, " "));
    if (value) return value;
  }
  return null;
}

function embeddedJsonString(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"),
      new RegExp(`'${escaped}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, "i"),
    ];
    const value = regexText(html, patterns);
    if (value) return value.replace(/\\"/g, "\"").replace(/\\\//g, "/");
  }
  return null;
}

function embeddedJsonNumber(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = regexText(html, [
      new RegExp(`"${escaped}"\\s*:\\s*"?([0-9]+(?:[.,][0-9]+)?)"?`, "i"),
      new RegExp(`'${escaped}'\\s*:\\s*'?([0-9]+(?:[.,][0-9]+)?)'?`, "i"),
    ]);
    if (value) return value;
  }
  return null;
}

function normalizeImageUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function normalizeCurrency(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "$" || normalized.includes("US $") || normalized.includes("USD")) return "USD";
  if (normalized === "€" || normalized.includes("EUR")) return "EUR";
  const iso = normalized.match(/\b[A-Z]{3}\b/)?.[0];
  return iso ?? null;
}

function titleFromSlug(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);
  const candidate = [...segments].reverse().find((segment) =>
    /[a-z]/i.test(segment) && !/^(product-detail|productdetail|product|pd|p-detail)$/i.test(segment)
  );
  if (!candidate) return null;
  const withoutExtension = candidate
    .replace(/\.html?$/i, "")
    .replace(/[_-]?\d{6,}.*$/i, "")
    .replace(/_[a-z0-9]+$/i, "");
  const words = withoutExtension
    .split(/[-_]+/)
    .map((word) => word.trim())
    .filter((word) => word && !/^\d+$/.test(word));
  if (words.length === 0) return null;
  return words
    .map((word) => word.length <= 3 && word === word.toUpperCase()
      ? word
      : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

export function buildSlugFallbackPreview(productUrl: string): SupplierOfferUrlPreview | null {
  const parsed = supplierOfferUrlImportRequestSchema.safeParse({ productUrl });
  if (!parsed.success) return null;
  const url = new URL(parsed.data.productUrl);
  const provider = detectUrlImportProvider(url);
  if (provider === "unknown" || !hasUrlProductIdentifier(provider, url)) return null;
  const title = titleFromSlug(url);
  if (!title) return null;
  return supplierOfferUrlPreviewSchema.parse({
    title,
    supplierName: null,
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl: parsed.data.productUrl,
    imageUrl: null,
    source: url.hostname,
    isPartial: true,
    titleFromSlug: true,
  });
}

function urlImportHeaders(url: URL): HeadersInit {
  const headers: Record<string, string> = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,de;q=0.8,sr;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  };
  if (url.hostname.endsWith("alibaba.com")) headers.referer = "https://www.alibaba.com/";
  if (url.hostname.endsWith("made-in-china.com")) headers.referer = "https://www.made-in-china.com/";
  return headers;
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.flatMap((match) => {
    try {
      const parsed = JSON.parse(match[1] ?? "") as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return values.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const record = value as Record<string, unknown>;
        const graph = Array.isArray(record["@graph"]) ? record["@graph"] : [];
        return [record, ...graph.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")];
      });
    } catch {
      return [];
    }
  });
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function imageText(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return text(value[0]);
  const object = record(value);
  return text(object?.url) ?? text(object?.contentUrl);
}

export function extractSupplierOfferFromHtml(html: string, productUrl: string): SupplierOfferUrlPreview {
  if (isBlockedHtml(html)) throw new UrlImportBlockedError("Blocked or CAPTCHA page.");
  const objects = jsonLdObjects(html);
  const product = objects.find((item) => item["@type"] === "Product") ?? {};
  const offerValue = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const offer = record(offerValue) ?? {};
  const brand = record(product.brand);
  const seller = record(offer.seller);
  const bodyText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ");
  const priceText = text(offer.price) ?? meta(html, "product:price:amount");
  const currency = text(offer.priceCurrency) ?? meta(html, "product:price:currency");
  const fallbackTitle = embeddedJsonString(html, [
    "subject",
    "productTitle",
    "productName",
    "seoTitle",
    "name",
    "title",
  ]) ?? regexText(html, [
    /"subject"\s*:\s*"([^"]+)"/i,
    /"productTitle"\s*:\s*"([^"]+)"/i,
    /"title"\s*:\s*"([^"]+)"/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]);
  const fallbackSupplier = embeddedJsonString(html, [
    "companyName",
    "supplierName",
    "storeName",
    "sellerName",
    "shopName",
  ]) ?? regexText(html, [
    /"companyName"\s*:\s*"([^"]+)"/i,
    /"supplierName"\s*:\s*"([^"]+)"/i,
    /"storeName"\s*:\s*"([^"]+)"/i,
    /(?:Company\s+Name|Supplier)\s*:?<\/?[^>]*>\s*([^<\n]+)/i,
    /(?:Company\s+Name|Supplier)\s*[:\-]\s*([^<\n]+)/i,
  ]);
  const fallbackPrice = priceText ?? embeddedJsonNumber(html, [
    "price",
    "minPrice",
    "salePrice",
    "offerPrice",
    "fobPrice",
    "unitPrice",
  ]) ?? regexText(html, [
    /"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
    /"priceString"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
    /"priceRange"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
    /US\s*\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /(?:FOB\s+Price|Price)[\s\S]{0,80}?US\s*\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
  ]);
  const fallbackCurrency = normalizeCurrency(currency ?? embeddedJsonString(html, [
    "priceCurrency",
    "currency",
    "currencyCode",
    "priceUnit",
  ]) ?? regexText(html, [
    /"priceCurrency"\s*:\s*"([A-Z]{3})"/i,
    /"currency"\s*:\s*"([A-Z]{3})"/i,
  ]) ?? (/US\s*\$|USD|\$\s*\d/i.test(html) ? "USD" : null));
  const embeddedMoq = embeddedJsonNumber(html, [
    "moq",
    "minOrderQuantity",
    "minimumOrderQuantity",
    "minOrder",
    "minOrderQuantity",
    "minOrderNum",
  ]);
  const moqMatch = bodyText.match(/(?:MOQ|minimum\s+order(?:\s+quantity)?)\s*[:\-]?\s*(\d+)/i)
    ?? bodyText.match(/(\d+)\s*(?:pieces|pcs|units)\s*\(?(?:MOQ|Min\.\s*Order)\)?/i);
  const incotermMatch = bodyText.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i);
  const titleTag = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const title = text(product.name) ?? fallbackTitle ?? meta(html, "og:title") ?? titleTag;
  const supplierName = text(seller?.name) ?? text(brand?.name) ?? fallbackSupplier ?? meta(html, "author");
  const imageUrl = normalizeImageUrl(
    imageText(product.image)
    ?? meta(html, "og:image")
    ?? meta(html, "twitter:image")
    ?? embeddedJsonString(html, ["imageUrl", "mainImage", "mainImageUrl", "imagePath", "imgUrl", "productImage"]),
  );
  const moq = embeddedMoq ?? moqMatch?.[1] ?? null;

  if (!title && !supplierName && !fallbackPrice && !fallbackCurrency && !moq && !imageUrl) {
    throw new UrlImportParsingError("No product fields found.");
  }
  const priorityValues = [title, supplierName, fallbackPrice, fallbackCurrency, moq, imageUrl, productUrl];
  const isPartial = priorityValues.some(Boolean) && !priorityValues.every(Boolean);

  return supplierOfferUrlPreviewSchema.parse({
    title,
    supplierName,
    supplierCountry: null,
    price: fallbackPrice ? Number(fallbackPrice.replace(",", ".")) : null,
    currency: fallbackCurrency,
    minimumOrderQuantity: moq ? Number(moq.replace(",", ".")) : null,
    incoterm: incotermMatch?.[1]?.toUpperCase() ?? null,
    productUrl,
    imageUrl,
    source: new URL(productUrl).hostname,
    isPartial,
  });
}

async function readLimitedBody(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new UrlImportResponseTooLargeError();
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new UrlImportResponseTooLargeError();
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export function createSupplierOfferUrlImportProvider(options: {
  fetcher?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxResponseBytes?: number;
} = {}): SupplierOfferUrlImportProvider {
  const fetcher = options.fetcher ?? fetch;
  const resolveHost = options.resolveHost ?? (async (hostname) => (await lookup(hostname, { all: true })).map((item) => item.address));
  const timeoutMs = options.timeoutMs ?? URL_IMPORT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? URL_IMPORT_MAX_RESPONSE_BYTES;

  return {
    async previewSupplierOfferUrl(input) {
      const diagnostics: UrlImportDiagnostics = {
        provider: "unknown",
        url: String(input),
        validationResult: "invalid",
      };
      const request = supplierOfferUrlImportRequestSchema.safeParse({ productUrl: input });
      if (!request.success) {
        diagnostics.finalReason = "url_validation_failed";
        logDiagnostics(diagnostics);
        throw request.error;
      }
      const { productUrl } = request.data;
      const url = new URL(productUrl);
      const provider = detectUrlImportProvider(url);
      diagnostics.provider = provider;
      diagnostics.validationResult = "valid";
      if (provider === "unknown") {
        diagnostics.finalReason = "unsupported_provider";
        logDiagnostics(diagnostics);
        throw new UrlImportUnsupportedUrlError("Unsupported supplier URL.");
      }
      if (!hasUrlProductIdentifier(provider, url)) {
        diagnostics.finalReason = "missing_product_identifier";
        logDiagnostics(diagnostics);
        throw new UrlImportMissingProductIdentifierError("Missing product identifier.");
      }
      if (isPrivateHost(url.hostname)) {
        diagnostics.finalReason = "private_host";
        logDiagnostics(diagnostics);
        throw new UrlImportFetchError("Private hosts are not allowed.");
      }

      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new UrlImportTimeoutError());
        }, timeoutMs);
      });
      try {
        const addresses = await Promise.race([resolveHost(url.hostname), timeoutPromise]);
        if (addresses.length === 0 || addresses.some(isPrivateHost)) {
          diagnostics.finalReason = "private_host";
          logDiagnostics(diagnostics);
          throw new UrlImportFetchError("Private hosts are not allowed.");
        }
        const response = await Promise.race([
          fetcher(productUrl, {
            headers: urlImportHeaders(url),
            redirect: "follow",
            signal: controller.signal,
          }),
          timeoutPromise,
        ]);
        diagnostics.httpStatus = response.status;
        if (!response.ok) {
          diagnostics.finalReason = `http_${response.status}`;
          logDiagnostics(diagnostics);
          throw new UrlImportFetchError(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          diagnostics.finalReason = "invalid_content_type";
          logDiagnostics(diagnostics);
          throw new UrlImportFetchError("URL does not return HTML.");
        }
        const html = await Promise.race([readLimitedBody(response, maxResponseBytes), timeoutPromise]);
        try {
          const preview = extractSupplierOfferFromHtml(html, productUrl);
          diagnostics.parserResult = "success";
          diagnostics.finalReason = "success";
          logDiagnostics(diagnostics);
          logUrlImportFlow({
            localParserUsed: true,
            externalProviderUsed: false,
            providerStatus: "success",
            previewFieldCount: previewFieldCount(preview),
            title: preview.title,
            supplier: preview.supplierName,
            price: preview.price,
            MOQ: preview.minimumOrderQuantity,
            image: preview.imageUrl,
          });
          return preview;
        } catch (error) {
          diagnostics.parserResult = error instanceof UrlImportBlockedError ? "blocked" : "failure";
          diagnostics.finalReason = error instanceof UrlImportBlockedError ? "blocked" : "parsing_failure";
          logDiagnostics(diagnostics);
          throw error;
        }
      } catch (error) {
        if (error instanceof UrlImportTimeoutError) {
          diagnostics.finalReason = "timeout";
          logDiagnostics(diagnostics);
          throw error;
        }
        if (error instanceof UrlImportResponseTooLargeError) {
          diagnostics.finalReason = "response_too_large";
          logDiagnostics(diagnostics);
          throw error;
        }
        if (
          error instanceof UrlImportFetchError ||
          error instanceof UrlImportBlockedError ||
          error instanceof UrlImportParsingError
        ) throw error;
        if (controller.signal.aborted) {
          diagnostics.finalReason = "timeout";
          logDiagnostics(diagnostics);
          throw new UrlImportTimeoutError();
        }
        diagnostics.finalReason = "network_error";
        logDiagnostics(diagnostics);
        throw new UrlImportFetchError(error instanceof Error ? error.message : "Fetch failed.");
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
  };
}

function externalProviderEndpoint() {
  const endpoint = localEnvValue("URL_IMPORT_PROVIDER_URL")?.trim();
  if (!endpoint) return null;
  const parsed = supplierOfferUrlImportRequestSchema.shape.productUrl.safeParse(endpoint);
  if (!parsed.success && !(process.env.NODE_ENV === "development" && endpoint.startsWith("http://localhost"))) {
    throw new UrlImportExternalProviderError("URL import provider URL must be HTTPS.");
  }
  return endpoint;
}

export function getUrlImportRuntimeDiagnostics() {
  const endpoint = externalProviderEndpoint();
  return {
    localParserUsed: !endpoint,
    externalProviderUsed: Boolean(endpoint),
    providerUrl: endpoint,
  };
}

export function createExternalSupplierOfferUrlImportProvider(options: {
  endpoint: string;
  token?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): SupplierOfferUrlImportProvider {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? URL_IMPORT_TIMEOUT_MS;

  return {
    async previewSupplierOfferUrl(input) {
      const request = supplierOfferUrlImportRequestSchema.safeParse({ productUrl: input });
      if (!request.success) throw request.error;

      const url = new URL(request.data.productUrl);
      const provider = detectUrlImportProvider(url);
      if (provider === "unknown") throw new UrlImportUnsupportedUrlError("Unsupported supplier URL.");
      if (!hasUrlProductIdentifier(provider, url)) throw new UrlImportMissingProductIdentifierError("Missing product identifier.");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        logUrlImportFlow({
          localParserUsed: false,
          externalProviderUsed: true,
          providerUrl: options.endpoint,
          providerStatus: "request_started",
        });
        const response = await fetcher(options.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          },
          body: JSON.stringify({ productUrl: request.data.productUrl }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as unknown;
        logUrlImportFlow({
          localParserUsed: false,
          externalProviderUsed: true,
          providerUrl: options.endpoint,
          providerStatus: response.status,
        });
        if (!response.ok) {
          if (response.status === 423 || (payload && typeof payload === "object" && "reason" in payload && String(payload.reason).toLowerCase().includes("block"))) {
            throw new UrlImportBlockedError("External URL import provider reported block.");
          }
          throw new UrlImportExternalProviderError(`External URL import provider failed with HTTP ${response.status}.`);
        }
        const candidate = payload && typeof payload === "object" && "preview" in payload
          ? (payload as { preview: unknown }).preview
          : payload;
        const preview = supplierOfferUrlPreviewSchema.parse(normalizeExternalPreview(candidate));
        logUrlImportFlow({
          localParserUsed: false,
          externalProviderUsed: true,
          providerUrl: options.endpoint,
          providerStatus: response.status,
          previewFieldCount: previewFieldCount(preview),
          title: preview.title,
          supplier: preview.supplierName,
          price: preview.price,
          MOQ: preview.minimumOrderQuantity,
          image: preview.imageUrl,
        });
        return preview;
      } catch (error) {
        if (error instanceof UrlImportBlockedError || error instanceof UrlImportUnsupportedUrlError || error instanceof UrlImportMissingProductIdentifierError) {
          throw error;
        }
        if (controller.signal.aborted) throw new UrlImportTimeoutError();
        if (error instanceof UrlImportExternalProviderError) throw error;
        throw new UrlImportExternalProviderError(error instanceof Error ? error.message : "External URL import provider failed.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function normalizeExternalPreview(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const record = candidate as Record<string, unknown>;
  const productUrl = record.productUrl;
  let source = record.source;
  if (!source && typeof productUrl === "string") {
    try {
      source = new URL(productUrl).hostname;
    } catch {
      source = "external-url-import-provider";
    }
  }
  return {
    title: record.title ?? record.productTitle ?? null,
    supplierName: record.supplierName ?? null,
    supplierCountry: record.supplierCountry ?? null,
    price: record.price ?? null,
    currency: record.currency ?? null,
    minimumOrderQuantity: record.minimumOrderQuantity ?? null,
    incoterm: record.incoterm ?? null,
    productUrl,
    imageUrl: record.imageUrl ?? null,
    source,
    isPartial: record.isPartial ?? false,
    titleFromSlug: record.titleFromSlug ?? false,
  };
}

const localSupplierOfferUrlImportProvider = createSupplierOfferUrlImportProvider();

export function getSupplierOfferUrlImportProvider(): SupplierOfferUrlImportProvider {
  const endpoint = externalProviderEndpoint();
  if (!endpoint) return localSupplierOfferUrlImportProvider;
  return createExternalSupplierOfferUrlImportProvider({
    endpoint,
    token: localEnvValue("URL_IMPORT_PROVIDER_TOKEN"),
  });
}

export const supplierOfferUrlImportProvider = localSupplierOfferUrlImportProvider;
