const required = [
  "DATABASE_URL",
  "APP_ORIGIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "SUPPLIER_SEARCH_PROVIDER_TOKEN",
  "URL_IMPORT_PROVIDER_URL",
  "URL_IMPORT_PROVIDER_TOKEN",
];

const secretNames = new Set([
  "GOOGLE_CLIENT_SECRET",
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

let appOrigin = null;
if (present("APP_ORIGIN")) {
  if (!validUrl(process.env.APP_ORIGIN, ["https:"])) {
    problems.push("APP_ORIGIN: production origin must use HTTPS");
  } else {
    const origin = new URL(process.env.APP_ORIGIN);
    appOrigin = origin.origin;
    if (origin.pathname !== "/" || origin.search || origin.hash) {
      problems.push("APP_ORIGIN: must be an origin without path, query or fragment");
    }
  }
}

if (present("GOOGLE_CLIENT_ID") && !process.env.GOOGLE_CLIENT_ID.trim().endsWith(".apps.googleusercontent.com")) {
  problems.push("GOOGLE_CLIENT_ID: expected Google OAuth web client ID");
}

if (present("GOOGLE_OAUTH_REDIRECT_URI")) {
  if (!validUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI, ["https:"])) {
    problems.push("GOOGLE_OAUTH_REDIRECT_URI: production redirect must use HTTPS");
  } else {
    const redirect = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI);
    if (redirect.pathname !== "/api/auth/google/callback" || redirect.search || redirect.hash) {
      problems.push("GOOGLE_OAUTH_REDIRECT_URI: expected exact /api/auth/google/callback path");
    }
    if (appOrigin && redirect.origin !== appOrigin) {
      problems.push("GOOGLE_OAUTH_REDIRECT_URI: origin must match APP_ORIGIN");
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
  googleOAuthConfigured: true,
  supplierSearchConfigured: true,
  urlImportConfigured: true,
  databaseConfigured: true,
}, null, 2));
