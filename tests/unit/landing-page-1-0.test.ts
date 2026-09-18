import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");

describe("ImportPilot 1.0 landing page", () => {
  it("describes the frozen three-input core flow", () => {
    expect(source).toContain("product, quantity and destination");
    expect(source).toContain("proizvod, količinu i destinaciju");
    expect(source).toContain("Compare the best offers");
    expect(source).toContain("BUY, NEGOTIATE, WATCH or SKIP");
    expect(source).toContain("KUPI, PREGOVARAJ, PRATI ili PRESKOČI");
    expect(source).toContain("procenjeni ukupan trošak uvoza");
  });

  it("does not advertise 2.0 workspace features on the 1.0 landing page", () => {
    expect(source).not.toContain("Manage supplier offers, real costs, risks and documents in one place.");
    expect(source).not.toContain("Add a project and offers");
    expect(source).not.toContain("negotiation message");
  });
});
