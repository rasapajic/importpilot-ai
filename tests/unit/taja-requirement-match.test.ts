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

  it("recognizes the live-result phrase 20 Misting Nozzles", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "High Pressure Misting System Kit w/App Control Pump - (20 Misting Nozzles)",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.PARTIAL);
    expect(match.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "MISTING", confirmed: true }),
      expect.objectContaining({ key: "PATIO", confirmed: false }),
      expect.objectContaining({ key: "PUMP", confirmed: true }),
      expect.objectContaining({ key: "NOZZLE_COUNT", expectedNumber: 20, confirmed: true }),
    ]));
  });

  it("recognizes piece markers and descriptive words before the nozzle noun", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "Patio Water Misting System with Pump and 20 Pcs Brass Misting Nozzles",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.FULL);
    expect(match.checks.find((check) => check.key === "NOZZLE_COUNT"))
      .toMatchObject({ confirmed: true, expectedNumber: 20 });
  });

  it("does not confuse hose length with the requested nozzle count", () => {
    const match = evaluateTajaRequirementMatch(query, {
      title: "Patio Water Misting System with Pump, 20m Hose and 10 Nozzles",
    });

    expect(match.status).toBe(TajaRequirementMatchStatuses.PARTIAL);
    expect(match.checks.find((check) => check.key === "NOZZLE_COUNT"))
      .toMatchObject({ confirmed: false, expectedNumber: 20 });
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
