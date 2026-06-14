import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const APP_URL = "http://localhost:3000";
const QUERY = {
  productQuery: "punjac za telefon typ c",
  query: "punjac za telefon typ c",
  quantity: 100,
  targetCountry: "RS",
  language: "sr",
};
const UI_UNAVAILABLE =
  "Automatska pretraga trenutno nije dostupna. Koristite „Uvezi iz linka” ili „Ručno dodaj ponudu”.";

function parseEnv(contents) {
  return Object.fromEntries(contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
    }));
}

async function envFile(path) {
  return parseEnv(await readFile(resolve(path), "utf8"));
}

async function responseJson(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(40_000) });
    return {
      reachable: true,
      status: response.status,
      headers: response.headers,
      body: await response.json().catch(() => null),
    };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      headers: new Headers(),
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function count(body) {
  return Array.isArray(body?.results) ? body.results.length : 0;
}

function projectItems(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["projects", "items", "data"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

const rootEnv = await envFile(".env");
const providerEnv = await envFile("services/importpilot-search-provider/.env");
const providerUrl = rootEnv.SUPPLIER_SEARCH_PROVIDER_URL;
const healthUrl = rootEnv.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL;
const rootToken = rootEnv.SUPPLIER_SEARCH_PROVIDER_TOKEN;
const providerToken = providerEnv.SEARCH_PROVIDER_TOKEN;
const tokenMatches = Boolean(rootToken && providerToken && rootToken === providerToken);
const authHeaders = rootToken ? { authorization: `Bearer ${rootToken}` } : {};

const healthWithoutAuth = healthUrl
  ? await responseJson(healthUrl)
  : { reachable: false, status: null, body: null };
const health = healthUrl
  ? await responseJson(healthUrl, { headers: authHeaders })
  : { reachable: false, status: null, body: null };
const providerSearch = providerUrl
  ? await responseJson(providerUrl, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(QUERY),
    })
  : { reachable: false, status: null, body: null };

const login = await responseJson(`${APP_URL}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: APP_URL },
  body: JSON.stringify({
    email: "owner@tradepilot.local",
    password: "TradePilot-Dev-2026",
  }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
const projects = cookie
  ? await responseJson(`${APP_URL}/api/projects?pageSize=50`, { headers: { cookie } })
  : { reachable: false, status: null, body: null };
const selectedProject = projectItems(projects.body).find((project) =>
  String(project.name ?? "").toLowerCase().includes("punjac"),
) ?? projectItems(projects.body)[0];
const appSearch = selectedProject?.id
  ? await responseJson(`${APP_URL}/api/projects/${selectedProject.id}/supplier-search`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY.query,
        quantity: QUERY.quantity,
        targetCountry: QUERY.targetCountry,
      }),
    })
  : { reachable: false, status: null, body: null };

const diagnosis = {
  configuration: {
    providerUrlSet: Boolean(providerUrl),
    healthUrlSet: Boolean(healthUrl),
    rootTokenSet: Boolean(rootToken),
    providerTokenSet: Boolean(providerToken),
    tokensMatch: tokenMatches,
  },
  providerReachable: health.reachable,
  providerAuthOk: tokenMatches && ![401, 403].includes(health.status) && healthWithoutAuth.status === 401,
  providerHealthStatus: health.status,
  providerResultCount: count(providerSearch.body),
  providerFinalReason: providerSearch.body?.reason ?? null,
  appLoginStatus: login.status,
  appProjectsStatus: projects.status,
  appProjectId: selectedProject?.id ?? null,
  appApiStatus: appSearch.status,
  appApiProviderStatus: appSearch.body?.providerStatus ?? null,
  appApiResultCount: count(appSearch.body),
  appApiReason: appSearch.body?.reason ?? null,
  appLiveProviderFailed: appSearch.body?.liveProviderFailed ?? null,
  appCacheHit: appSearch.body?.cacheHit ?? null,
  returnedFromCache: appSearch.body?.returnedFromCache ?? null,
  uiFacingReason: count(appSearch.body) === 0 ? UI_UNAVAILABLE : null,
};

console.log("Supplier search end-to-end diagnosis");
console.log(JSON.stringify(diagnosis, null, 2));

if (!diagnosis.configuration.tokensMatch) process.exitCode = 2;
else if (!diagnosis.providerReachable || !diagnosis.providerAuthOk) process.exitCode = 3;
else if (diagnosis.appApiStatus !== 200) process.exitCode = 4;
