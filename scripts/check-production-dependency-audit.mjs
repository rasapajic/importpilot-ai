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
    if (!lock.packages || typeof lock.packages !== "object" || !lock.packages[""]) {
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

function dependencyKeys(metadata) {
  if (!metadata || typeof metadata !== "object") return [];
  return [
    ...Object.keys(metadata.dependencies ?? {}),
    ...Object.keys(metadata.optionalDependencies ?? {}),
  ];
}

const lock = readLockfile();
const metadataByName = new Map();
for (const [path, metadata] of Object.entries(lock.packages)) {
  const name = packageNameFromPath(path);
  if (!name || !metadata || typeof metadata !== "object") continue;
  const entries = metadataByName.get(name) ?? [];
  entries.push(metadata);
  metadataByName.set(name, entries);
}

const root = lock.packages[""];
const productionNames = new Set([
  ...Object.keys(root.dependencies ?? {}),
  ...Object.keys(root.optionalDependencies ?? {}),
]);
const queue = [...productionNames];

while (queue.length > 0) {
  const name = queue.shift();
  for (const metadata of metadataByName.get(name) ?? []) {
    for (const dependencyName of dependencyKeys(metadata)) {
      if (productionNames.has(dependencyName)) continue;
      productionNames.add(dependencyName);
      queue.push(dependencyName);
    }
  }
}

const audit = runAudit();
if (audit.error) {
  fail(`npm audit service returned an error: ${JSON.stringify(audit.error)}`);
}
if (!audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
  fail("npm audit JSON did not contain a vulnerabilities object.");
}

const vulnerabilities = Object.entries(audit.vulnerabilities);
const productionFindings = vulnerabilities
  .filter(([name, finding]) => productionNames.has(name) && finding && typeof finding === "object")
  .map(([name, finding]) => ({
    name,
    severity: String(finding.severity ?? "unknown").toLowerCase(),
    range: finding.range ?? "unknown",
  }));

const blocked = productionFindings.filter((finding) => blockedSeverities.has(finding.severity));
const ignoredHighDevOnly = vulnerabilities
  .filter(([name, finding]) =>
    !productionNames.has(name) &&
    finding &&
    typeof finding === "object" &&
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
  "PRODUCTION_DEPENDENCY_AUDIT PASS: no high or critical vulnerabilities are reachable from declared runtime dependency roots.",
);
