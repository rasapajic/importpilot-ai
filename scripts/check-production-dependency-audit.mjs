import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const blockedSeverities = new Set(["high", "critical"]);

function fail(message) {
  console.error(`PRODUCTION_DEPENDENCY_AUDIT ERROR: ${message}`);
  process.exit(2);
}

function runAudit() {
  const result = spawnSync(npmCommand, ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) fail(`npm audit could not start: ${result.error.message}`);
  if (!result.stdout?.trim()) fail("npm audit returned no JSON output.");
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`npm audit returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readLockfile() {
  try {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    if (!lock.packages || typeof lock.packages !== "object") {
      fail("package-lock.json does not contain package reachability metadata.");
    }
    return lock;
  } catch (error) {
    fail(`package-lock.json could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function packageNameFromPath(path) {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  if (index < 0) return null;
  const tail = path.slice(index + marker.length);
  if (!tail) return null;
  const parts = tail.split("/");
  return parts[0]?.startsWith("@") && parts[1]
    ? `${parts[0]}/${parts[1]}`
    : parts[0] ?? null;
}

const lock = readLockfile();
const productionPaths = new Set();
const productionNames = new Set();

for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || !path.includes("node_modules/")) continue;
  if (metadata && typeof metadata === "object" && metadata.dev === true) continue;
  productionPaths.add(path);
  const name = packageNameFromPath(path);
  if (name) productionNames.add(name);
}

const audit = runAudit();
if (audit.error) {
  fail(`npm audit service returned an error: ${JSON.stringify(audit.error)}`);
}
if (!audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
  fail("npm audit JSON did not contain a vulnerabilities object.");
}

const vulnerabilities = Object.entries(audit.vulnerabilities);

function isProductionReachable(name, finding) {
  const nodes = Array.isArray(finding?.nodes) ? finding.nodes : [];
  if (nodes.length > 0) {
    return nodes.some((node) => productionPaths.has(node));
  }
  return productionNames.has(name);
}

const productionFindings = vulnerabilities
  .filter(([name, finding]) => finding && typeof finding === "object" && isProductionReachable(name, finding))
  .map(([name, finding]) => ({
    name,
    severity: String(finding.severity ?? "unknown").toLowerCase(),
    range: finding.range ?? "unknown",
  }));

const blocked = productionFindings.filter((finding) => blockedSeverities.has(finding.severity));
const ignoredHighDevOnly = vulnerabilities
  .filter(([name, finding]) =>
    finding &&
    typeof finding === "object" &&
    !isProductionReachable(name, finding) &&
    blockedSeverities.has(String(finding.severity ?? "").toLowerCase()))
  .map(([name, finding]) => `${name} (${String(finding.severity).toLowerCase()})`);

console.log(
  `PRODUCTION_DEPENDENCY_AUDIT productionPackages=${productionNames.size} findings=${productionFindings.length} blocked=${blocked.length}`,
);
if (ignoredHighDevOnly.length > 0) {
  console.log(`PRODUCTION_DEPENDENCY_AUDIT ignoredDevOnly=${ignoredHighDevOnly.join(", ")}`);
}

if (blocked.length > 0) {
  for (const finding of blocked) {
    console.error(`BLOCKED ${finding.name} severity=${finding.severity} range=${finding.range}`);
  }
  process.exit(1);
}

console.log(
  "PRODUCTION_DEPENDENCY_AUDIT PASS: no high or critical vulnerabilities are reachable from lockfile production packages.",
);
