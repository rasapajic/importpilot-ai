import { describe, expect, it } from "vitest";

import {
  calculationMatchesOfferPrice,
  latestCalculationIfCurrent,
} from "../../modules/cost-engine/domain/current-calculation";
import { decisionRemainsCurrent } from "../../modules/decisions/domain/current-decision";

describe("current offer calculation", () => {
  const previous = { id: "old", unitPrice: "0.7000", currency: "USD" };
  const replacement = { id: "new", unitPrice: "1.0500", currency: "USD" };

  it("treats only the latest calculation at the current offer price as current", () => {
    expect(calculationMatchesOfferPrice(previous, { unitPrice: "0.70", currency: "USD" })).toBe(true);
    expect(latestCalculationIfCurrent([previous], { unitPrice: "1.05", currency: "USD" })).toBeNull();
    expect(latestCalculationIfCurrent(
      [replacement, previous],
      { unitPrice: "1.05", currency: "USD" },
    )).toBe(replacement);
  });

  it("does not present a decision made before the confirmed price change as current", () => {
    const offer = {
      id: "offer",
      sourceMetadata: {
        supplierConfirmation: { calculationSupersededAt: "2026-10-23T12:00:00.000Z" },
      },
      costCalculations: [replacement],
    };
    expect(decisionRemainsCurrent({
      selectedOfferId: "offer",
      createdAt: new Date("2026-10-23T11:00:00.000Z"),
    }, [offer])).toBe(false);
    expect(decisionRemainsCurrent({
      selectedOfferId: "offer",
      createdAt: new Date("2026-10-23T13:00:00.000Z"),
    }, [offer])).toBe(true);
    expect(decisionRemainsCurrent({
      selectedOfferId: "offer",
      createdAt: new Date("2026-10-23T13:00:00.000Z"),
    }, [{ ...offer, costCalculations: [] }])).toBe(false);
  });
});