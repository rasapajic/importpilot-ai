import { lookup } from "node:dns/promises";

export const PROVIDER_VERSION = "0.1.0";

export type DiagnosticsReason =
  | "BLOCKED"
  | "TLS"
  | "DNS"
  | "TIMEOUT"
  | "FETCH_FAILURE"
  | "PROVIDER_BUG";

type LastFetchError = {
  at: string;
  provider?: string;
  urlHost?: string;
  reason: DiagnosticsReason;
  errorName?: string;
  errorMessage?: string;
  errorCause?: string;
  statusCode?: number;
  timeout?: boolean;
};

let lastFetchError: LastFetchError | null = null;

export function classifyFetchError(error: unknown, timeout = false): DiagnosticsReason {
  if (timeout) return "TIMEOUT";
  const message = error instanceof Error ? `${error.name} ${error.message} ${"cause" in error ? String(error.cause) : ""}` : String(error);
  if (/captcha|robot|security check|access denied|blocked/i.test(message)) return "BLOCKED";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(message)) return "DNS";
  if (/CERT|TLS|SSL|certificate|handshake|self[-\s]?signed/i.test(message)) return "TLS";
  return "FETCH_FAILURE";
}

export function rememberFetchError(input: {
  provider?: string;
  productUrl?: string;
  reason: DiagnosticsReason;
  error?: unknown;
  statusCode?: number;
  timeout?: boolean;
}) {
  let urlHost: string | undefined;
  if (input.productUrl) {
    try {
      urlHost = new URL(input.productUrl).hostname;
    } catch {
      urlHost = undefined;
    }
  }
  lastFetchError = {
    at: new Date().toISOString(),
    provider: input.provider,
    urlHost,
    reason: input.reason,
    errorName: input.error instanceof Error ? input.error.name : undefined,
    errorMessage: input.error instanceof Error ? input.error.message : input.error ? String(input.error) : undefined,
    errorCause: input.error instanceof Error && "cause" in input.error ? String(input.error.cause) : undefined,
    statusCode: input.statusCode,
    timeout: input.timeout,
  };
  console.info(JSON.stringify({ event: "url_import_fetch_error", ...lastFetchError }));
}

export function getLastFetchError() {
  return lastFetchError;
}

export async function runDnsDiagnostics(hostnames = ["www.alibaba.com", "www.made-in-china.com"]) {
  const results: Record<string, unknown> = {};
  await Promise.all(hostnames.map(async (hostname) => {
    try {
      const addresses = await lookup(hostname, { all: true });
      results[hostname] = {
        ok: true,
        addresses: addresses.map((address) => address.address).slice(0, 5),
      };
    } catch (error) {
      results[hostname] = {
        ok: false,
        reason: "DNS",
        errorName: error instanceof Error ? error.name : "Unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return results;
}

export async function runHttpsDiagnostics(options: {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  urls?: string[];
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  const urls = options.urls ?? ["https://www.alibaba.com", "https://www.made-in-china.com"];
  const timeoutMs = options.timeoutMs ?? 8_000;
  const results: Record<string, unknown> = {};

  await Promise.all(urls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      results[url] = {
        ok: true,
        status: response.status,
        finalUrl: response.url,
      };
    } catch (error) {
      results[url] = {
        ok: false,
        reason: classifyFetchError(error, controller.signal.aborted),
        timeout: controller.signal.aborted,
        errorName: error instanceof Error ? error.name : "Unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCause: error instanceof Error && "cause" in error ? String(error.cause) : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }));

  return results;
}

export async function getProviderDiagnostics(options: {
  fetcher?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  const dns = await runDnsDiagnostics();
  const https = await runHttpsDiagnostics(options);
  const httpsValues = Object.values(https) as Array<{ ok?: boolean }>;
  return {
    providerVersion: PROVIDER_VERSION,
    environment: process.env.NODE_ENV ?? "development",
    outboundFetchCapability: httpsValues.some((result) => result.ok) ? "ok" : "failed",
    dnsTestResult: dns,
    httpsTestResult: https,
    lastFetchError,
  };
}
