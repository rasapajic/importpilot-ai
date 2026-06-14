import { createServer } from "node:http";

import { createUrlImportProviderApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const server = createServer(createUrlImportProviderApp({
  token: process.env.URL_IMPORT_PROVIDER_TOKEN,
  timeoutMs: Number(process.env.URL_IMPORT_TIMEOUT_MS ?? 8_000),
  maxResponseBytes: Number(process.env.URL_IMPORT_MAX_RESPONSE_BYTES ?? 1_000_000),
  debugHtml: process.env.URL_IMPORT_DEBUG_HTML === "true",
}));

server.listen(port, () => {
  console.info(JSON.stringify({ event: "server_listening", url: `http://localhost:${port}` }));
});
