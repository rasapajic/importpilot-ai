import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages: Record<string, LockPackage>;
};

const patchedFloors = {
  next: "16.3.8",
  sharp: "0.35.5",
  "source-map-js": "1.2.2",
} as const;

function versionParts(version: string) {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((part) => Number(part));
  return [major, minor, patch];
}

function isAtLeast(actual: string, minimum: string) {
  const left = versionParts(actual);
  const right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index]! > right[index]!;
  }
  return true;
}

function resolvedPackages(lock: PackageLock, name: string) {
  return Object.entries(lock.packages).filter(([path, entry]) =>
    path.endsWith(`node_modules/${name}`) && typeof entry.version === "string",
  );
}

describe("production dependency security floor", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides: Record<string, string>;
  };
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as PackageLock;

  it("pins Next.js and its ESLint config on the patched 16.3.8 release", () => {
    expect(manifest.dependencies.next).toBe("16.3.8");
    expect(manifest.devDependencies["eslint-config-next"]).toBe("16.3.8");
    expect(lock.packages["node_modules/next"]?.version).toBe("16.3.8");
  });

  it("overrides transitive sharp and source-map-js to their patched releases", () => {
    expect(manifest.overrides.sharp).toBe(patchedFloors.sharp);
    expect(manifest.overrides["source-map-js"]).toBe(patchedFloors["source-map-js"]);
  });

  it("does not keep a vulnerable production copy of Next.js, sharp, or source-map-js", () => {
    for (const [name, minimum] of Object.entries(patchedFloors)) {
      const copies = resolvedPackages(lock, name);
      expect(copies.length).toBeGreaterThan(0);
      for (const [path, entry] of copies) {
        expect(isAtLeast(entry.version ?? "0.0.0", minimum), `${path}@${entry.version}`).toBe(true);
      }
    }
  });
});
