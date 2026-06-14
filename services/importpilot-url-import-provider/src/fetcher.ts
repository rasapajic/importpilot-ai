import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectProvider, hasProductIdentifier, parseProductPreview } from "./parser.js";
import { previewRequestSchema, type ProductPreview } from "./contract.js";

export class UrlImportProviderError extends Error {
  constructor(public readonly reason: "NETWORK_ERROR" | "BLOCKED" | "PARSING_FAILED" | "INVALID_URL", message: string = reason) {
    super(message);
  }
}

type FetchOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  debugHtml?: boolean;
};

function logDevelopment(event: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(JSON.stringify({ event: "url_import_provider", ...event }));
}

function previewFieldCount(preview: ProductPreview) {
  return [
    preview.productTitle,
    preview.supplierName,
    preview.price,
    preview.currency,
    preview.minimumOrderQuantity,
    preview.imageUrl,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function requestHeaders(url: URL): HeadersInit {
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

async function readLimited(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new UrlImportProviderError("NETWORK_ERROR", "Response too large.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new UrlImportProviderError("NETWORK_ERROR", "Response too large.");
  return text;
}

async function maybeSaveDebugHtml(html: string, provider: string, enabled: boolean) {
  if (!enabled || process.env.NODE_ENV === "production") return;
  const dir = tmpdir();
  await mkdir(dir, { recursive: true });
  const file = join(dir, `importpilot-url-import-${provider}-${Date.now()}.html`);
  await writeFile(file, html.slice(0, 300_000), "utf8");
  console.info(JSON.stringify({ event: "debug_html_saved", html_saved: true, file_path: file }));
}

export async function previewProductUrl(productUrl: string, options: FetchOptions = {}): Promise<ProductPreview> {
  const parsed = previewRequestSchema.safeParse({ productUrl });
  if (!parsed.success) {
    logDevelopment({ validationResult: "invalid", finalReason: "INVALID_URL" });
    throw new UrlImportProviderError("INVALID_URL");
  }
  const url = new URL(parsed.data.productUrl);
  const provider = detectProvider(url);
  logDevelopment({
    provider,
    url: parsed.data.productUrl,
    validationResult: "valid",
    productIdentifier: hasProductIdentifier(url),
  });
  if (provider === "unknown" || !hasProductIdentifier(url)) {
    logDevelopment({ provider, finalReason: "INVALID_URL" });
    throw new UrlImportProviderError("INVALID_URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await (options.fetcher ?? fetch)(parsed.data.productUrl, {
      headers: requestHeaders(url),
      redirect: "follow",
      signal: controller.signal,
    });
    logDevelopment({ provider, upstreamStatus: response.status, finalUrl: response.url });
    const html = await readLimited(response, options.maxResponseBytes ?? 1_000_000);
    await maybeSaveDebugHtml(html, provider, Boolean(options.debugHtml));
    if (!response.ok) throw new UrlImportProviderError("NETWORK_ERROR", `HTTP ${response.status}`);
    const preview = parseProductPreview(html, parsed.data.productUrl);
    logDevelopment({
      provider,
      finalReason: "success",
      previewFieldCount: previewFieldCount(preview),
      title: preview.productTitle,
      supplier: preview.supplierName,
      price: preview.price,
      MOQ: preview.minimumOrderQuantity,
      image: preview.imageUrl,
    });
    return preview;
  } catch (error) {
    if (error instanceof UrlImportProviderError) {
      logDevelopment({ provider, finalReason: error.reason, errorMessage: error.message });
      throw error;
    }
    if (error instanceof Error && error.message === "BLOCKED") {
      logDevelopment({ provider, blocked: true, finalReason: "BLOCKED" });
      throw new UrlImportProviderError("BLOCKED");
    }
    if (error instanceof Error && error.message === "PARSING_FAILED") {
      logDevelopment({ provider, parserResult: "failure", finalReason: "PARSING_FAILED" });
      throw new UrlImportProviderError("PARSING_FAILED");
    }
    if (controller.signal.aborted) {
      logDevelopment({ provider, timeout: true, finalReason: "NETWORK_ERROR", errorMessage: "Timeout." });
      throw new UrlImportProviderError("NETWORK_ERROR", "Timeout.");
    }
    logDevelopment({
      provider,
      finalReason: "NETWORK_ERROR",
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCause: error instanceof Error && "cause" in error ? String(error.cause) : undefined,
    });
    throw new UrlImportProviderError("NETWORK_ERROR", error instanceof Error ? error.message : "Fetch failed.");
  } finally {
    clearTimeout(timeout);
  }
}
