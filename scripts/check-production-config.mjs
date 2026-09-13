const required = [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "SUPPLIER_SEARCH_PROVIDER_URL",
  "SUPPLIER_SEARCH_PROVIDER_TOKEN",
  "URL_IMPORT_PROVIDER_URL",
  "URL_IMPORT_PROVIDER_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
];

const secretNames = new Set([
  "S3_SECRET_KEY",
  "SUPPLIER_SEARCH_PROVIDER_TOKEN",
  "URL_IMPORT_PROVIDER_TOKEN",
  "GOOGLE_CLIENT_SECRET",
]);

const placeholderPattern = /(?:change[-_ ]?this|replace[-_ ]?me|ci[-_ ]?only|example[-_ ]?secret|your[-_ ]?secret)/i;

function present(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function validUrl(name, protocols) {
  if (!present(name)) return false;
  try {
    const url = new URL(process.env[name]);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

const problems = [];
for (const name of required) {
  if (!present(name)) problems.push(`${name}: missing`);
}

for (const name of required) {
  const value = process.env[name]?.trim() ?? "";
  if (value && placeholderPattern.test(value)) problems.push(`${name}: placeholder value`);
}

for (const name of secretNames) {
  const value = process.env[name]?.trim() ?? "";
  if (value && value.length < 16) problems.push(`${name}: too short for production`);
}

if (present("DATABASE_URL") && !validUrl("DATABASE_URL", ["postgres:", "postgresql:"])) {
  problems.push("DATABASE_URL: must be a PostgreSQL URL");
}

for (const name of ["SUPPLIER_SEARCH_PROVIDER_URL", "URL_IMPORT_PROVIDER_URL"]) {
  if (present(name) && !validUrl(name, ["https:"])) {
    problems.push(`${name}: production endpoint must use HTTPS`);
  }
}

if (present("S3_PUBLIC_ENDPOINT") && !validUrl("S3_PUBLIC_ENDPOINT", ["https:"])) {
  problems.push("S3_PUBLIC_ENDPOINT: public production endpoint must use HTTPS");
}

if (present("GOOGLE_OAUTH_REDIRECT_URI")) {
  if (!validUrl("GOOGLE_OAUTH_REDIRECT_URI", ["https:"])) {
    problems.push("GOOGLE_OAUTH_REDIRECT_URI: must use HTTPS in production");
  } else {
    const redirect = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI);
    if (redirect.pathname !== "/api/auth/google/callback") {
      problems.push("GOOGLE_OAUTH_REDIRECT_URI: path must be /api/auth/google/callback");
    }
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
  googleOAuthConfigured: true,
  supplierSearchConfigured: true,
  urlImportConfigured: true,
  databaseConfigured: true,
  objectStorageConfigured: true,
}, null, 2));
