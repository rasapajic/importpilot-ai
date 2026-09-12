import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const blockedSeverities = new Set(["high", "critical"]);

function runNpm(args, label) {
  const result = spawnSync(npmCommand, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    console.error(`PRODUCTION_DEPENDENCY_AUDIT ERROR: ${label} could not start: ${result.error.message}`);
    process.exit(2);
  }
  return result;
}

function parseJsonOutput(result, label) {
  const stdout = result.stdout?.trim();
  if (!stdout) {
    console.error(`PRODUCTION_DEPENDENCY_AUDIT ERROR: ${label} returned no JSON output.`);
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    process.exit(2);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`PRODUCTION_DEPENDENCY_AUDIT ERROR: ${label} returned invalid JSON.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

function collectDependencyNames(dependencies, names = new Set()) {
  if (!dependencies || typeof dependencies !== "object") return names;
  for (const [name, value] of Object.entries(dependencies)) {
    names.add(name);
    if (value && typeof value === "object") {
      collectDependencyNames(value.dependencies, names);
    }
  }
  return names;
}

const treeResult = runNpm(["ls", "--omit=dev", "--all", "--json"], "npm ls --omit=dev");
const tree = parseJsonOutput(treeResult, "npm ls --omit=dev");
const productionPackages = collectDependencyNames(tree.dependencies);

const auditResult = runNpm(["audit", "--json"], "npm audit");
const audit = parseJsonOutput(auditResult, "npm audit");
const vulnerabilities = audit.vulnerabilities && typeof audit.vulnerabilities === "object"
  ? Object.entries(audit.vulnerabilities)
  : [];

const productionFindings = vulnerabilities
  .filter(([name, finding]) => productionPackages.has(name) && finding && typeof finding === "object")
  .map(([name, finding]) => ({
    name,
    severity: String(finding.severity ?? "unknown").toLowerCase(),
    range: finding.range ?? "unknown",
  }));

const blocked = productionFindings.filter((finding) => blockedSeverities.has(finding.severity));
const ignoredHighDevOnly = vulnerabilities
  .filter(([name, finding]) =>
    !productionPackages.has(name) &&
    finding &&
    typeof finding === "object" &&
    blockedSeverities.has(String(finding.severity ?? "").toLowerCase()))
  .map(([name, finding]) => `${name} (${String(finding.severity).toLowerCase()})`);

console.log(`PRODUCTION_DEPENDENCY_AUDIT productionPackages=${productionPackages.size} findings=${productionFindings.length} blocked=${blocked.length}`);
if (ignoredHighDevOnly.length > 0) {
  console.log(`PRODUCTION_DEPENDENCY_AUDIT ignoredDevOnly=${ignoredHighDevOnly.join(", ")}`);
}

if (blocked.length > 0) {
  for (const finding of blocked) {
    console.error(`BLOCKED ${finding.name} severity=${finding.severity} range=${finding.range}`);
  }
  process.exit(1);
}

console.log("PRODUCTION_DEPENDENCY_AUDIT PASS: no high or critical vulnerabilities are reachable from the production dependency tree.");
