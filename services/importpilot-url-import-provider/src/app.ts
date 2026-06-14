import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { previewRequestSchema, type PreviewFailure, type PreviewSuccess } from "./contract.js";
import { getProviderDiagnostics, PROVIDER_VERSION } from "./diagnostics.js";
import { previewProductUrl, UrlImportProviderError } from "./fetcher.js";

type AppOptions = {
  token?: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  debugHtml?: boolean;
  fetcher?: typeof fetch;
};

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function authorized(header: string | undefined, token?: string) {
  if (!token) return true;
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

function failure(error: unknown): { status: number; body: PreviewFailure } {
  if (error instanceof UrlImportProviderError) {
    const status = error.reason === "INVALID_URL"
      ? 400
      : error.reason === "BLOCKED"
        ? 423
        : error.reason === "PARSING_FAILED"
          ? 422
          : 502;
    return { status, body: { error: error.message, reason: error.reason } };
  }
  return { status: 502, body: { error: "URL import provider failed.", reason: "NETWORK_ERROR" } };
}

export function createUrlImportProviderApp(options: AppOptions = {}) {
  return async function handler(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      if (url.searchParams.get("verbose") === "1") {
        const diagnostics = await getProviderDiagnostics({
          fetcher: options.fetcher,
          timeoutMs: options.timeoutMs,
        });
        return sendJson(response, 200, { ok: true, ...diagnostics });
      }
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/diagnostics") {
      const diagnostics = await getProviderDiagnostics({
        fetcher: options.fetcher,
        timeoutMs: options.timeoutMs,
      });
      return sendJson(response, 200, diagnostics);
    }

    if (!authorized(request.headers.authorization, options.token)) {
      return sendJson(response, 401, { error: "Unauthorized." });
    }

    if (request.method === "POST" && url.pathname === "/preview") {
      try {
        const parsed = previewRequestSchema.safeParse(await readJson(request, options.maxRequestBytes ?? 100_000));
        if (!parsed.success) return sendJson(response, 400, { error: "Invalid URL.", reason: "INVALID_URL" } satisfies PreviewFailure);
        const preview = await previewProductUrl(parsed.data.productUrl, {
          fetcher: options.fetcher,
          timeoutMs: options.timeoutMs,
          maxResponseBytes: options.maxResponseBytes,
          debugHtml: options.debugHtml,
        });
        return sendJson(response, 200, { preview } satisfies PreviewSuccess);
      } catch (error) {
        if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
          return sendJson(response, 413, { error: "Request too large.", reason: "INVALID_URL" } satisfies PreviewFailure);
        }
        const result = failure(error);
        return sendJson(response, result.status, result.body);
      }
    }

    return sendJson(response, 404, { error: "Not found.", providerVersion: PROVIDER_VERSION });
  };
}
