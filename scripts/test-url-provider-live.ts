import { existsSync, readFileSync } from "node:fs";

const DEFAULT_PROVIDER_URL = "https://importpilot-url-import-provider.onrender.com/preview";
const DEFAULT_TEST_URL = "https://www.alibaba.com/product-detail/Factory-Wholesale-20W-PD-Fast-Charger_1601287661261.html";

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

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function previewEndpoint(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!url.pathname || url.pathname === "/") url.pathname = "/preview";
  return url;
}

function diagnosticsEndpoint(previewUrl: URL) {
  const url = new URL(previewUrl);
  url.pathname = url.pathname.replace(/\/preview\/?$/, "/diagnostics");
  if (!url.pathname.endsWith("/diagnostics")) url.pathname = "/diagnostics";
  url.search = "";
  return url;
}

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getLastPreviewDiagnostics(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("lastPreviewDiagnostics" in payload)) return null;
  const diagnostics = (payload as { lastPreviewDiagnostics: unknown }).lastPreviewDiagnostics;
  return diagnostics && typeof diagnostics === "object" ? diagnostics as Record<string, unknown> : null;
}

function printJson(label: string, value: unknown) {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  loadLocalEnv();

  const productUrl = arg("--url") ?? DEFAULT_TEST_URL;
  const providerUrl = previewEndpoint(process.env.URL_IMPORT_PROVIDER_URL ?? DEFAULT_PROVIDER_URL);
  const diagnosticsUrl = diagnosticsEndpoint(providerUrl);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.URL_IMPORT_PROVIDER_TOKEN) {
    headers.authorization = `Bearer ${process.env.URL_IMPORT_PROVIDER_TOKEN}`;
  }

  console.log(`Provider preview URL: ${providerUrl.toString()}`);
  console.log(`Diagnostics URL: ${diagnosticsUrl.toString()}`);
  console.log(`Product URL: ${productUrl}`);
  console.log(`Token configured: ${Boolean(process.env.URL_IMPORT_PROVIDER_TOKEN)}`);

  const previewResponse = await fetch(providerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ productUrl }),
  });
  const previewBody = await readBody(previewResponse);

  console.log(`HTTP status: ${previewResponse.status}`);
  printJson("Response body", previewBody);

  const diagnosticsResponse = await fetch(diagnosticsUrl);
  const diagnosticsBody = await readBody(diagnosticsResponse);
  const lastPreviewDiagnostics = getLastPreviewDiagnostics(diagnosticsBody);

  console.log(`Diagnostics HTTP status: ${diagnosticsResponse.status}`);
  if (!lastPreviewDiagnostics) {
    printJson("Diagnostics body", diagnosticsBody);
    process.exit(previewResponse.ok ? 0 : 1);
  }

console.log(`lastPreviewDiagnostics.finalReason: ${String(lastPreviewDiagnostics.finalReason ?? "unknown")}`);
console.log(`htmlLength: ${String(lastPreviewDiagnostics.htmlLength ?? 0)}`);
console.log(`antiBotDetected: ${String(lastPreviewDiagnostics.antiBotDetected ?? false)}`);
console.log(`parserFieldCount: ${String(lastPreviewDiagnostics.parserFieldCount ?? 0)}`);
printJson("parserCandidates", lastPreviewDiagnostics.parserCandidates ?? []);

  process.exit(previewResponse.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
