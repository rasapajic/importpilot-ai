import { createServer } from "node:http";

import { createSearchProviderApp } from "./app.js";
import { createAlibabaSupplierSearchSource } from "./alibaba-source.js";
import { createDevelopmentLogger } from "./development-log.js";
import { createMadeInChinaSupplierSearchSource } from "./made-in-china-provider.js";
import { createFallbackSupplierSearchSource } from "./provider.js";

const port = Number(process.env.PORT ?? 4000);
const token = process.env.SEARCH_PROVIDER_TOKEN ?? "";
const logger = createDevelopmentLogger();
const source = createFallbackSupplierSearchSource([
  createAlibabaSupplierSearchSource({
    userAgent: process.env.ALIBABA_USER_AGENT,
    requestTimeoutMs: Number(process.env.ALIBABA_TIMEOUT_MS ?? 4_000),
    logger,
  }),
  createMadeInChinaSupplierSearchSource({
    userAgent: process.env.MADE_IN_CHINA_USER_AGENT,
    debugHtml: process.env.SEARCH_PROVIDER_DEBUG_HTML === "true",
    requestTimeoutMs: Number(process.env.MADE_IN_CHINA_TIMEOUT_MS ?? 5_000),
    logger,
  }),
], logger);

const server = createServer(createSearchProviderApp({
  token,
  source,
  logger,
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 30_000),
  rateLimitMax: Number(process.env.SEARCH_RATE_LIMIT_MAX ?? 30),
  rateLimitWindowMs: Number(process.env.SEARCH_RATE_LIMIT_WINDOW_MS ?? 60_000),
}));

server.listen(port, () => {
  logger("server_listening", { url: `http://localhost:${port}` });
});
