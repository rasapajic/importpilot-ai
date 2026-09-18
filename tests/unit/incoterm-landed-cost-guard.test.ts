import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LANDED_COST_1_0_INCOTERMS,
  isSupportedLandedCostIncoterm,
} from "../../modules/cost-engine/domain/incoterms";

const serviceSource = readFileSync(
  join(process.cwd(), "modules/cost-engine/application/cost-service.ts"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/offers/[offerId]/cost-calculations/route.ts"),
  "utf8",
);

describe("ImportPilot 1.0 landed-cost Incoterm guard", () => {
  it("supports only origin-side terms modeled by the 1.0 calculator", () => {
    expect(LANDED_COST_1_0_INCOTERMS).toEqual(["EXW", "FCA", "FAS", "FOB"]);
    for (const incoterm of LANDED_COST_1_0_INCOTERMS) {
      expect(isSupportedLandedCostIncoterm(incoterm)).toBe(true);
    }
  });

  it("rejects delivery-inclusive terms rather than risking double counting", () => {
    for (const incoterm of ["CIF", "CIP", "DAP", "DPU", "DDP"]) {
      expect(isSupportedLandedCostIncoterm(incoterm)).toBe(false);
    }
  });

  it("enforces the guard before calculation persistence", () => {
    expect(serviceSource).toContain("isSupportedLandedCostIncoterm(offer.incoterm)");
    expect(serviceSource).toContain("throw new UnsupportedLandedCostIncotermError(offer.incoterm)");
  });

  it("returns a clear client-facing error instead of a misleading number", () => {
    expect(routeSource).toContain("UnsupportedLandedCostIncotermError");
    expect(routeSource).toContain("podržava uslove EXW, FCA, FAS i FOB");
    expect(routeSource).toContain("potencijalno pogrešnu računicu");
  });
});
