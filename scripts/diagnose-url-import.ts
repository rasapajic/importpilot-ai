import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";

import { supplierOfferUrlImportRequestSchema } from "../modules/product-search/domain/search";
import {
  buildSlugFallbackPreview,
  detectUrlImportProvider,
  extractSupplierOfferFromHtml,
  hasUrlProductIdentifier,
  isBlockedHtml,
  URL_IMPORT_MAX_RESPONSE_BYTES,
  URL_IMPORT_TIMEOUT_MS,
  UrlImportBlockedError,
  UrlImportParsingError,
} from "../modules/product-search/infrastructure/url-import-provider";

function loadLocalEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function headers(url: URL): HeadersInit {
  const value: Record<string, string> = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,de;q=0.8,sr;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  };
  if (url.hostname.endsWith("alibaba.com")) value.referer = "https://www.alibaba.com/";
  if (url.hostname.endsWith("made-in-china.com")) value.referer = "https://www.made-in-china.com/";
  return value;
}

async function readLimited(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > URL_IMPORT_MAX_RESPONSE_BYTES) {
    throw new Error(`response_too_large: ${declared}`);
  }
  const text = await response.text();
  return text.slice(0, URL_IMPORT_MAX_RESPONSE_BYTES);
}

function userMessage(reason: string) {
  if (reason === "blocked") return "Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda.";
  if (reason === "timeout") return "Link nije odgovorio na vreme. Pokušajte ponovo.";
  if (reason === "unsupported_provider") return "Link nije prepoznat kao Alibaba ili Made-in-China proizvod.";
  if (reason === "missing_product_identifier") return "Link ne sadrži prepoznatljiv identifikator proizvoda.";
  if (reason === "parsing_failure") return "Nismo uspeli da pronađemo podatke o proizvodu na ovoj stranici.";
  return "Došlo je do mrežne greške. Pokušajte ponovo.";
}

function print(data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    console.log(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
}

function countPreviewFields(preview: Record<string, unknown>) {
  return [
    preview.title ?? preview.productTitle,
    preview.supplierName,
    preview.price,
    preview.currency,
    preview.minimumOrderQuantity,
    preview.imageUrl,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

async function diagnoseExternalProvider(productUrl: string) {
  const endpoint = process.env.URL_IMPORT_PROVIDER_URL;
  if (!endpoint) return { externalProviderUsed: false };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.URL_IMPORT_PROVIDER_TOKEN) headers.authorization = `Bearer ${process.env.URL_IMPORT_PROVIDER_TOKEN}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ productUrl }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    const candidate = payload && typeof payload === "object" && "preview" in payload
      ? (payload as { preview: unknown }).preview
      : payload;
    const preview = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
    return {
      externalProviderUsed: true,
      providerUrl: endpoint,
      providerStatus: response.status,
      providerReason: payload && typeof payload === "object" && "reason" in payload ? (payload as { reason: unknown }).reason : null,
      previewFieldCount: preview ? countPreviewFields(preview) : 0,
      title: preview?.title ?? preview?.productTitle ?? null,
      supplier: preview?.supplierName ?? null,
      price: preview?.price ?? null,
      MOQ: preview?.minimumOrderQuantity ?? null,
      image: preview?.imageUrl ?? null,
    };
  } catch (error) {
    return {
      externalProviderUsed: true,
      providerUrl: endpoint,
      providerStatus: "fetch_failed",
      providerErrorName: error instanceof Error ? error.name : "Unknown",
      providerErrorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

const inputUrl = arg("--url");
if (!inputUrl) {
  console.error("Usage: npm run diagnose:url-import -- --url \"https://...\"");
  process.exit(1);
}

async function main() {
  const diagnostics: Record<string, unknown> = {
    inputUrl,
    endpointCalled: "/api/supplier-url-preview",
    externalProviderConfigured: Boolean(process.env.URL_IMPORT_PROVIDER_URL),
    externalProviderUrl: process.env.URL_IMPORT_PROVIDER_URL || null,
    externalProviderTokenConfigured: Boolean(process.env.URL_IMPORT_PROVIDER_TOKEN),
    timeout: false,
    blockedOrCaptcha: false,
    parserFieldsExtracted: {},
  };

  let finalReason = "network_error";

  try {
    const validation = supplierOfferUrlImportRequestSchema.safeParse({ productUrl: inputUrl });
    diagnostics.validationResult = validation.success ? "valid" : "invalid";
    if (!validation.success) {
      finalReason = "url_validation_failed";
      diagnostics.finalUserFacingMessage = "Unesite ispravan HTTPS link.";
      print(diagnostics);
      return;
    }

    const normalizedUrl = validation.data.productUrl;
    const url = new URL(normalizedUrl);
    const provider = detectUrlImportProvider(url);
    diagnostics.normalizedUrl = normalizedUrl;
    diagnostics.detectedProvider = provider;
    Object.assign(diagnostics, await diagnoseExternalProvider(normalizedUrl));

    if (provider === "unknown") {
      finalReason = "unsupported_provider";
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
      print(diagnostics);
      return;
    }

    if (!hasUrlProductIdentifier(provider, url)) {
      finalReason = "missing_product_identifier";
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
      print(diagnostics);
      return;
    }

    try {
      const addresses = await lookup(url.hostname, { all: true });
      diagnostics.dnsAddresses = addresses.map((item) => item.address);
    } catch (error) {
      diagnostics.fetchErrorName = error instanceof Error ? error.name : "Unknown";
      diagnostics.fetchErrorMessage = error instanceof Error ? error.message : String(error);
      finalReason = "network_error";
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
      diagnostics.slugFallbackPreview = buildSlugFallbackPreview(normalizedUrl);
      print(diagnostics);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_IMPORT_TIMEOUT_MS);
    let response: Response | null = null;
    try {
      response = await fetch(normalizedUrl, {
        headers: headers(url),
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      diagnostics.fetchErrorName = error instanceof Error ? error.name : "Unknown";
      diagnostics.fetchErrorMessage = error instanceof Error ? error.message : String(error);
      diagnostics.fetchErrorCause = error instanceof Error && "cause" in error ? String(error.cause) : undefined;
      diagnostics.timeout = controller.signal.aborted;
      finalReason = controller.signal.aborted ? "timeout" : "network_error";
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
      diagnostics.slugFallbackPreview = buildSlugFallbackPreview(normalizedUrl);
      print(diagnostics);
      return;
    } finally {
      clearTimeout(timeout);
    }

    diagnostics.httpStatus = response.status;
    diagnostics.finalUrl = response.url;
    diagnostics.contentType = response.headers.get("content-type");
    const html = await readLimited(response);
    diagnostics.responseBytesRead = html.length;
    diagnostics.blockedOrCaptcha = isBlockedHtml(html);

    if (isBlockedHtml(html)) {
      finalReason = "blocked";
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
      diagnostics.slugFallbackPreview = buildSlugFallbackPreview(normalizedUrl);
      print(diagnostics);
      return;
    }

    try {
      const preview = extractSupplierOfferFromHtml(html, normalizedUrl);
      diagnostics.parserFieldsExtracted = {
        title: preview.title,
        supplierName: preview.supplierName,
        price: preview.price,
        currency: preview.currency,
        minimumOrderQuantity: preview.minimumOrderQuantity,
        imageUrl: preview.imageUrl,
        productUrl: preview.productUrl,
        isPartial: preview.isPartial,
        titleFromSlug: preview.titleFromSlug,
      };
      finalReason = "success";
      diagnostics.finalUserFacingMessage = "OK";
    } catch (error) {
      diagnostics.parserErrorName = error instanceof Error ? error.name : "Unknown";
      diagnostics.parserErrorMessage = error instanceof Error ? error.message : String(error);
      finalReason = error instanceof UrlImportBlockedError ? "blocked" : "parsing_failure";
      if (error instanceof UrlImportParsingError) diagnostics.slugFallbackPreview = buildSlugFallbackPreview(normalizedUrl);
      diagnostics.finalUserFacingMessage = userMessage(finalReason);
    }
  } catch (error) {
    diagnostics.fetchErrorName = error instanceof Error ? error.name : "Unknown";
    diagnostics.fetchErrorMessage = error instanceof Error ? error.message : String(error);
    diagnostics.finalUserFacingMessage = userMessage(finalReason);
  }

  print(diagnostics);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
