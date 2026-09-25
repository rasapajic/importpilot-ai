import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { serializePrismaDecimals } from "../../modules/shared/serialize-prisma-decimals";

describe("serializePrismaDecimals", () => {
  it("converts nested Decimal values without changing dates or the source object", () => {
    const createdAt = new Date("2026-06-14T00:00:00.000Z");
    const source = {
      unitPrice: new Prisma.Decimal("12.3400"),
      createdAt,
      calculations: [{ landedCostTotal: new Prisma.Decimal("1234.56") }],
    };

    const result = serializePrismaDecimals(source);

    expect(result.unitPrice).toBe("12.34");
    expect(result.calculations[0].landedCostTotal).toBe("1234.56");
    expect(result.createdAt).toBe(createdAt);
    expect(Prisma.Decimal.isDecimal(source.unitPrice)).toBe(true);
  });
});
