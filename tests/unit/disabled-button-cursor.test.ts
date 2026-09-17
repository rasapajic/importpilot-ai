import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("disabled button cursor", () => {
  it("does not present a disabled control as a loading state", () => {
    const block = css.match(/button:disabled\s*\{[^}]*\}/)?.[0] ?? "";

    expect(block).toContain("cursor: not-allowed");
    expect(block).not.toContain("cursor: wait");
  });
});
