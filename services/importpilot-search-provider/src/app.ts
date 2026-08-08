import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  searchRequestSchema,
  type SearchRequest,
  type SearchResponse,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";
import {
  runValidatedSearch,
  unconfiguredSupplierSearchSource,
  type SupplierSearchSource,
} from "./provider.js";
import { createRateLimiter } from "./rate-limit.js";

const DEFAULT_IDEMPOTENCY_TTL_MS = 2 * 60 * 1_000;
const MIN_IDEMPOTENCY_TTL_MS = 5_000;
const MAX_IDEMPOTENCY_TTL_MS = 15 * 60 * 1_000;

type AppOptions = {
  token: string;
  source?: SupplierSearchSource;
  timeoutMs?: number;
  maxRequestBytes?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  idempotencyTtlMs?: number;
  logger?: DevelopmentLogger;
  now?: () => number;
};

type SearchExecution = {
  status: number;
  body: SearchResponse | { error: string };
};

type CachedSearchExecution = SearchExecution & {
  expiresAt: number;
};

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function authorized(header: string | undefined, token: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function readJson(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function clientKey(request: IncomingMessage) {
  return request.socket.remoteAddress ?? "unknown";
}

function boundedTtl(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_IDEMPOTENCY_TTL_MS;
  return Math.max(
    MIN_IDEMPOTENCY_TTL_MS,
    Math.min(MAX_IDEMPOTENCY_TTL_MS, Math.trunc(value!)),
  );
}

function idempotencyHeader(request: IncomingMessage) {
  const value = request.headers["idempotency-key"];
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  const normalized = candidate.trim();
  return /^[A-Za-z0-9._:-]{8,200}$/.test(normalized) ? normalized : null;
}

function searchFingerprint(input: SearchRequest) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function idempotencyScope(key: string, input: SearchRequest) {
  return `${key}:${searchFingerprint(input)}`;
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("UPSTREAM_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createSearchProviderApp({
  token,
  source = unconfiguredSupplierSearchSource,
  timeoutMs = 8_000,
  maxRequestBytes = 100_000,
  rateLimitMax = 30,
  rateLimitWindowMs = 60_000,
  idempotencyTtlMs,
  logger = createDevelopmentLogger(),
  now = Date.now,
}: AppOptions) {
  if (!token) throw new Error("SEARCH_PROVIDER_TOKEN is required.");
  const rateLimiter = createRateLimiter(rateLimitMax, rateLimitWindowMs);
  const safeIdempotencyTtlMs = boundedTtl(idempotencyTtlMs);
  const inFlightSearches = new Map<string, Promise<SearchExecution>>();
  const completedSearches = new Map<string, CachedSearchExecution>();

  function pruneCompletedSearches(timestamp: number) {
    for (const [key, cached] of completedSearches.entries()) {
      if (cached.expiresAt <= timestamp) completedSearches.delete(key);
    }
  }

  async function executeSearch(input: SearchRequest): Promise<SearchExecution> {
    try {
      const outcome = await withTimeout(
        timeoutMs,
        (signal) => runValidatedSearch(source, input, signal),
      );
      logger("search_results", {
        resultCount: outcome.results.length,
        ...(outcome.results.length === 0 ? { reason: outcome.reason } : {}),
      });
      return {
        status: 200,
        body: outcome satisfies SearchResponse,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "UPSTREAM_TIMEOUT";
      const message = timedOut
        ? "Supplier search source timed out."
        : "Supplier search source returned an invalid or unavailable response.";
      logger("search_results", {
        resultCount: 0,
        reason: message,
      });
      return {
        status: timedOut ? 504 : 502,
        body: { error: message },
      };
    }
  }

  return async function handler(request: IncomingMessage, response: ServerResponse) {
    if (!authorized(request.headers.authorization, token)) {
      return sendJson(response, 401, { error: "Unauthorized." });
    }

    const limit = rateLimiter.check(clientKey(request));
    if (!limit.allowed) {
      return sendJson(response, 429, { error: "Rate limit exceeded." }, {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    if (request.method === "GET" && request.url === "/health") {
      try {
        const sourceHealthy = source.healthCheck
          ? await withTimeout(timeoutMs, (signal) => source.healthCheck!(signal))
          : true;
        return sendJson(response, sourceHealthy ? 200 : 503, {
          status: sourceHealthy ? "ok" : "error",
          source: source.name,
          implemented: source.implemented,
        });
      } catch {
        return sendJson(response, 503, {
          status: "error",
          source: source.name,
          implemented: source.implemented,
        });
      }
    }

    if (request.method === "POST" && request.url === "/search") {
      try {
        const parsed = searchRequestSchema.safeParse(await readJson(request, maxRequestBytes));
        if (!parsed.success) {
          return sendJson(response, 400, {
            error: "Invalid search request.",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          });
        }

        logger("search_request_received", {
          productQuery: parsed.data.productQuery,
          quantity: parsed.data.quantity,
          targetCountry: parsed.data.targetCountry,
        });

        if (!source.implemented) {
          const body: SearchResponse = {
            results: [],
            reason: "No real supplier-search source is configured.",
          };
          logger("search_results", {
            resultCount: 0,
            reason: body.reason,
          });
          return sendJson(response, 200, body);
        }

        const suppliedIdempotencyKey = idempotencyHeader(request);
        const scope = suppliedIdempotencyKey
          ? idempotencyScope(suppliedIdempotencyKey, parsed.data)
          : null;
        const timestamp = now();
        pruneCompletedSearches(timestamp);

        if (scope) {
          const cached = completedSearches.get(scope);
          if (cached && cached.expiresAt > timestamp) {
            logger("search_idempotency_replay", {
              state: "completed",
              productQuery: parsed.data.productQuery,
              resultStatus: cached.status,
            });
            return sendJson(response, cached.status, cached.body, {
              "x-importpilot-idempotency": "completed-replay",
            });
          }

          const inFlight = inFlightSearches.get(scope);
          if (inFlight) {
            logger("search_idempotency_replay", {
              state: "in_flight",
              productQuery: parsed.data.productQuery,
            });
            const execution = await inFlight;
            return sendJson(response, execution.status, execution.body, {
              "x-importpilot-idempotency": "in-flight-coalesced",
            });
          }
        }

        const executionPromise = executeSearch(parsed.data);
        if (scope) inFlightSearches.set(scope, executionPromise);

        let execution: SearchExecution;
        try {
          execution = await executionPromise;
        } finally {
          if (scope) inFlightSearches.delete(scope);
        }

        if (scope && execution.status === 200) {
          completedSearches.set(scope, {
            ...execution,
            expiresAt: now() + safeIdempotencyTtlMs,
          });
        }

        return sendJson(response, execution.status, execution.body, scope
          ? { "x-importpilot-idempotency": "new" }
          : {});
      } catch (error) {
        return sendJson(
          response,
          error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 400,
          { error: "Invalid JSON request." },
        );
      }
    }

    return sendJson(response, 404, { error: "Not found." });
  };
}
