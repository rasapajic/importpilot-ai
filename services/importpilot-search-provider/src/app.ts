import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { searchRequestSchema, type SearchResponse } from "./contract.js";
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

type AppOptions = {
  token: string;
  source?: SupplierSearchSource;
  timeoutMs?: number;
  maxRequestBytes?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  logger?: DevelopmentLogger;
};

function sendJson(response: ServerResponse, status: number, body: unknown, headers = {}) {
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
  logger = createDevelopmentLogger(),
}: AppOptions) {
  if (!token) throw new Error("SEARCH_PROVIDER_TOKEN is required.");
  const rateLimiter = createRateLimiter(rateLimitMax, rateLimitWindowMs);

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

        try {
          const outcome = await withTimeout(
            timeoutMs,
            (signal) => runValidatedSearch(source, parsed.data, signal),
          );
          logger("search_results", {
            resultCount: outcome.results.length,
            ...(outcome.results.length === 0 ? { reason: outcome.reason } : {}),
          });
          return sendJson(response, 200, outcome satisfies SearchResponse);
        } catch (error) {
          const timedOut = error instanceof Error && error.message === "UPSTREAM_TIMEOUT";
          logger("search_results", {
            resultCount: 0,
            reason: timedOut
              ? "Supplier search source timed out."
              : "Supplier search source returned an invalid or unavailable response.",
          });
          return sendJson(response, timedOut ? 504 : 502, {
            error: timedOut
              ? "Supplier search source timed out."
              : "Supplier search source returned an invalid or unavailable response.",
          });
        }
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
