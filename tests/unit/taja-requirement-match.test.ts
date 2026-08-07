import { describe, expect, it } from "vitest";

import {
  evaluateTajaRequirementMatch,
  TajaRequirementMatchStatuses,
} from "../../modules/product-search/domain/taja-requirement-match";

describe("TAJA product requirement matching", () => {
  const query = "Vodena magla za terasu sa pumpom i 20 mlaznica";

  it("marks a relevant title as partial when pump and nozzle count are not confirmed", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "Adjustable Irrigation Kit DIY 10m Micro Drip Irrigation System Sprayers Misting Cooling System Kit for Garden Patio",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.PARTIAL);
    expect(match.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "MISTING", confirmed: true }),
      expect.objectContaining({ key: "PATIO", confirmed: true }),
      expect.objectContaining({ key: "PUMP", confirmed: false }),
      expect.objectContaining({ key: "NOZZLE_COUNT", expectedNumber: 20, confirmed: false }),
    ]));
    expect(match.scoreAdjustment).toBeLessThanOrEqual(0);
  });

  it("marks the offer as full only when all extracted requirements are explicit", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "Patio Water Misting System with Pump and 20 Nozzles",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.FULL);
    expect(match.checks.every((check) => check.confirmed)).toBe(true);
    expect(match.scoreAdjustment).toBeGreaterThan(0);
  });

  it("does not claim a match for an unrelated product", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "Stainless Steel Kitchen Storage Rack",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.UNCONFIRMED);
    expect(match.scoreAdjustment).toBeLessThan(0);
  });

  it("stays neutral when the query has no supported explicit requirement", () => {
    const match = evaluateTajaRequirementMatch("industrijski proizvod", {
      title: "Industrial product",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.NOT_EVALUATED);
    expect(match.scoreAdjustment).toBe(0);
    expect(match.checks).toEqual([]);
  });
});
