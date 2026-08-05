import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getLunaSearchCopy } from "../../components/search/luna-search-copy";

const supplierSearchSource = readFileSync(
  join(process.cwd(), "components/search/supplier-offer-search.tsx"),
  "utf8",
);

describe("TAJA supplier-search copy", () => {
  it("uses the public TAJA identity in all supported languages", () => {
    expect(getLunaSearchCopy("sr")).toMatchObject({
      title: "TAJA pretraga",
      startSearch: "Pronađi stvarne ponude",
    });
    expect(getLunaSearchCopy("de").title).toBe("TAJA Suche");
    expect(getLunaSearchCopy("en").title).toBe("TAJA Search");
  });

  it("renders the localized title instead of the former hard-coded Luna title", () => {
    expect(supplierSearchSource).toContain("<h2>{lunaCopy.title}</h2>");
    expect(supplierSearchSource).not.toContain("<h2>Luna Search</h2>");
  });
});
