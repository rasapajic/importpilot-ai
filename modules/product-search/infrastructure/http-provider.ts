import { createHash } from "node:crypto";

import {
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type SupplierOfferSearchInput,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchResult,
} from "../domain/search";

export const SUPPLIER_SEARCH_TIMEOUT_MS = 35_000;
export const SUPPLIER_SEARCH_MAX_RESPONSE_BYTES = 1_000_000;
export const SUPPLIER_SEARCH_CACHE_TTL_MS = 10 * 60 * 1_000;

export class SupplierSearchProviderError extends Error {}
export class SupplierSearchProviderHttpError extends SupplierSearchProviderError {}
export class SupplierSearchProviderTimeoutError extends SupplierSearchProviderError {}
export class SupplierSearchProviderResponseTooLargeError extends SupplierSearchProviderError {}
export class SupplierSearchProviderInvalidResponseError extends SupplierSearchProviderError {}
export class SupplierSearchProviderUnavailableError extends SupplierSearchProviderError {
  constructor(readonly reason: string) {
    super(reason);
  }
}

type CacheEntry = { expiresAt: number; results: SupplierOfferSearchResult[] };
type SearchCache = Map<string, CacheEntry>;

const sharedSearchCache: SearchCache = new Map();

type HttpProviderOptions = {
  endpoint: string;
  healthEndpoint?: string;
  token?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  cacheTtlMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fetcher?: typeof fetch;
  cache?: SearchCache;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  allowInsecureLocalhost?: boolean;
};

function secureUrl(value: string, label: string, allowInsecureLocalhost: boolean) {
  const url = new URL(value);
  const localHttp =
    allowInsecureLocalhost &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new SupplierSearchProviderError(`${label} must use HTTPS.`);
  }
  return url;
}

function requestKey(endpoint: URL, input: SupplierOfferSearchInput) {
  return `${endpoint.href}:${JSON.stringify(input)}`;
}

function idempotencyKey(endpoint: URL, input: SupplierOfferSearchInput) {
  return createHash("sha256").update(requestKey(endpoint, input)).digest("hex");
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function createHttpSupplierOfferSearchProvider({
  endpoint,
  healthEndpoint,
  token,
  timeoutMs = SUPPLIER_SEARCH_TIMEOUT_MS,
  maxResponseBytes = SUPPLIER_SEARCH_MAX_RESPONSE_BYTES,
  cacheTtlMs = SUPPLIER_SEARCH_CACHE_TTL_MS,
  maxAttempts = 2,
  retryDelayMs = 150,
  fetcher = fetch,
  cache = fetcher === fetch ? sharedSearchCache : new Map(),
  now = Date.now,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  allowInsecureLocalhost = false,
}: HttpProviderOptions): SupplierOfferSearchProvider {
  const providerUrl = secureUrl(endpoint, "Supplier search provider", allowInsecureLocalhost);
  const healthUrl = secureUrl(
    healthEndpoint ?? endpoint,
    "Supplier search health endpoint",
    allowInsecureLocalhost,
  );
  const headers = {
    accept: "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  async function fetchWithTimeout(url: URL, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new SupplierSearchProviderTimeoutError();
      }
      throw new SupplierSearchProviderError("Supplier search provider request failed.");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async healthCheck() {
      try {
        const response = await fetchWithTimeout(healthUrl, { method: "GET", headers });
        return response.ok;
      } catch {
        return false;
      }
    },

    async searchSupplierOffers(rawInput) {
      const input = supplierOfferSearchInputSchema.parse(rawInput);
      const key = requestKey(providerUrl, input);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.results;
      if (cached) cache.delete(key);

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetchWithTimeout(providerUrl, {
            method: "POST",
            headers: {
              ...headers,
              "content-type": "application/json",
              "idempotency-key": idempotencyKey(providerUrl, input),
            },
            body: JSON.stringify(input),
          });
          if (!response.ok) {
            if (isRetryableStatus(response.status) && attempt < maxAttempts) {
              await wait(retryDelayMs * attempt);
              continue;
            }
            throw new SupplierSearchProviderHttpError(`Provider returned ${response.status}.`);
          }

          const contentLength = Number(response.headers.get("content-length") ?? 0);
          if (contentLength > maxResponseBytes) {
            throw new SupplierSearchProviderResponseTooLargeError();
          }
          const body = await response.text();
          if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
            throw new SupplierSearchProviderResponseTooLargeError();
          }

          try {
            const payload = JSON.parse(body) as unknown;
            const results =
              payload && typeof payload === "object" && "results" in payload
                ? (payload as { results: unknown }).results
                : payload;
            const parsed = supplierOfferSearchResultsSchema.parse(results);
            const reason = payload && typeof payload === "object" && "reason" in payload
              ? (payload as { reason?: unknown }).reason
              : undefined;
            if (parsed.length === 0 && typeof reason === "string") {
              throw new SupplierSearchProviderUnavailableError(reason);
            }
            cache.set(key, { expiresAt: now() + cacheTtlMs, results: parsed });
            return parsed;
          } catch (error) {
            if (error instanceof SupplierSearchProviderUnavailableError) throw error;
            throw new SupplierSearchProviderInvalidResponseError();
          }
        } catch (error) {
          if (
            attempt < maxAttempts &&
            (error instanceof SupplierSearchProviderTimeoutError ||
              (error instanceof SupplierSearchProviderError &&
                !(error instanceof SupplierSearchProviderHttpError) &&
                !(error instanceof SupplierSearchProviderInvalidResponseError) &&
                !(error instanceof SupplierSearchProviderResponseTooLargeError) &&
                !(error instanceof SupplierSearchProviderUnavailableError)))
          ) {
            await wait(retryDelayMs * attempt);
            continue;
          }
          throw error;
        }
      }
      throw new SupplierSearchProviderError("Supplier search provider request failed.");
    },
  };
}
