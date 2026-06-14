import { createServer } from "node:http";

import { createUrlImportProviderApp } from "./app.js";
import { runDnsDiagnostics } from "./diagnostics.js";

const port = Number(process.env.PORT ?? 4100);
const server = createServer(createUrlImportProviderApp({
  token: process.env.URL_IMPORT_PROVIDER_TOKEN,
  timeoutMs: Number(process.env.URL_IMPORT_TIMEOUT_MS ?? 8_000),
  maxResponseBytes: Number(process.env.URL_IMPORT_MAX_RESPONSE_BYTES ?? 1_000_000),
  debugHtml: process.env.URL_IMPORT_DEBUG_HTML === "true",
}));

server.listen(port, () => {
  console.info(JSON.stringify({ event: "server_listening", url: `http://localhost:${port}` }));
  runDnsDiagnostics()
    .then((result) => console.info(JSON.stringify({ event: "startup_dns_diagnostics", result })))
    .catch((error: unknown) => console.info(JSON.stringify({
      event: "startup_dns_diagnostics_failed",
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    })));
});
