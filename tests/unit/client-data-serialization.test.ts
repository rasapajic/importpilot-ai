import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { serializeClientData } from "../../lib/serialization/client-data";

const projectServiceSource = readFileSync(
  join(process.cwd(), "modules/projects/application/project-service.ts"),
  "utf8",
);

describe("client data serialization", () => {
  it("converts nested Prisma Decimal, Date, and BigInt values to plain values", () => {
    const result = serializeClientData({
      confidenceScore: new Prisma.Decimal("0.875"),
      createdAt: new Date("2026-08-04T15:00:00.000Z"),
      size: 42n,
      nested: [{ margin: new Prisma.Decimal("27.6") }],
    });

    expect(result).toEqual({
      confidenceScore: "0.875",
      createdAt: "2026-08-04T15:00:00.000Z",
      size: "42",
      nested: [{ margin: "27.6" }],
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.nested[0])).toBe(Object.prototype);
  });

  it("serializes the complete project payload before it reaches Client Components", () => {
    expect(projectServiceSource).toContain(
      'import { serializeClientData } from "@/lib/serialization/client-data";',
    );
    expect(projectServiceSource).toContain("return serializeClientData({");
    expect(projectServiceSource).toContain("latestCostAssumptions");
  });
});
