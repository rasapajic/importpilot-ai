const required = [
  "DATABASE_URL",
  "APP_ORIGIN",
  "SUPPLIER_SEARCH_PROVIDER_TOKEN",
  "URL_IMPORT_PROVIDER_URL",
  "URL_IMPORT_PROVIDER_TOKEN",
];

const secretNames = new Set([
  "SUPPLIER_SEARCH_PROVIDER_TOKEN",
  "URL_IMPORT_PROVIDER_TOKEN",
]);

const placeholderPattern = /(?:change[-_ ]?this|replace[-_ ]?me|ci[-_ ]?only|example[-_ ]?secret|your[-_ ]?secret|disabled)/i;

function present(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function validUrl(value, protocols) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

const problems = [];
for (const name of required) {
  if (!present(name)) problems.push(`${name}: missing`);
}

const providerBaseUrl = process.env.SUPPLIER_SEARCH_PROVIDER_BASE_URL?.trim() ?? "";
const providerUrl = process.env.SUPPLIER_SEARCH_PROVIDER_URL?.trim() ?? "";
const providerHealthUrl = process.env.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL?.trim() ?? "";

if (!providerBaseUrl && !providerUrl) {
  problems.push("supplier search endpoint: set SUPPLIER_SEARCH_PROVIDER_BASE_URL or SUPPLIER_SEARCH_PROVIDER_URL");
}

if (providerBaseUrl && !validUrl(providerBaseUrl, ["https:"])) {
  problems.push("SUPPLIER_SEARCH_PROVIDER_BASE_URL: production endpoint must use HTTPS");
}
if (providerUrl && !validUrl(providerUrl, ["https:"])) {
  problems.push("SUPPLIER_SEARCH_PROVIDER_URL: production endpoint must use HTTPS");
}
if (providerHealthUrl && !validUrl(providerHealthUrl, ["https:"])) {
  problems.push("SUPPLIER_SEARCH_PROVIDER_HEALTH_URL: production endpoint must use HTTPS");
}

for (const name of required) {
  const value = process.env[name]?.trim() ?? "";
  if (value && placeholderPattern.test(value)) problems.push(`${name}: placeholder value`);
}

for (const name of secretNames) {
  const value = process.env[name]?.trim() ?? "";
  if (value && value.length < 16) problems.push(`${name}: too short for production`);
}

if (present("DATABASE_URL") && !validUrl(process.env.DATABASE_URL, ["postgres:", "postgresql:"])) {
  problems.push("DATABASE_URL: must be a PostgreSQL URL");
}

if (present("APP_ORIGIN")) {
  if (!validUrl(process.env.APP_ORIGIN, ["https:"])) {
    problems.push("APP_ORIGIN: production origin must use HTTPS");
  } else {
    const origin = new URL(process.env.APP_ORIGIN);
    if (origin.pathname !== "/" || origin.search || origin.hash) {
      problems.push("APP_ORIGIN: must be an origin without path, query or fragment");
    }
  }
}

if (present("URL_IMPORT_PROVIDER_URL")) {
  if (!validUrl(process.env.URL_IMPORT_PROVIDER_URL, ["https:"])) {
    problems.push("URL_IMPORT_PROVIDER_URL: production endpoint must use HTTPS");
  } else if (new URL(process.env.URL_IMPORT_PROVIDER_URL).pathname !== "/preview") {
    problems.push("URL_IMPORT_PROVIDER_URL: expected exact /preview endpoint");
  }
}

const uniqueProblems = [...new Set(problems)];
if (uniqueProblems.length > 0) {
  console.error("IMPORTPILOT_PRODUCTION_CONFIG BLOCKED");
  for (const problem of uniqueProblems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("IMPORTPILOT_PRODUCTION_CONFIG PASS");
console.log(JSON.stringify({
  requiredVariables: required.length,
  appOriginConfigured: true,
  supplierSearchConfigured: true,
  urlImportConfigured: true,
  databaseConfigured: true,
}, null, 2));
