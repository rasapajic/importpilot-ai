import { describe, expect, it } from "vitest";

import { createSupplierSearchQueryVariants } from "../src/query-variants.js";

describe("supplier search query variants", () => {
  it("translates and normalizes common Serbian purchasing terms", () => {
    expect(createSupplierSearchQueryVariants("punjač za telefon typ c")).toEqual([
      "punjac za telefon typ c",
      "phone charger type c",
      "type c phone charger",
    ]);
  });

  it("keeps an English query as a single variant", () => {
    expect(createSupplierSearchQueryVariants("USB C charger")).toEqual(["USB C charger"]);
  });
});
