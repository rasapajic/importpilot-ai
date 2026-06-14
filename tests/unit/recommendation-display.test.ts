import { describe, expect, it } from "vitest";

import { recommendationBadgeStatus } from "../../modules/intelligence/application/recommendation-display";
import { getStatusLabel } from "../../modules/i18n/translations";

describe("offer recommendation display badges", () => {
  it.each([
    ["RECOMMENDED", "KUPI"],
    ["OK_WITH_RISK", "PREGOVARAJ"],
    ["NEEDS_NEGOTIATION", "PREGOVARAJ"],
    ["NOT_RECOMMENDED", "PRESKOČI"],
  ] as const)("maps %s to %s", (status, label) => {
    expect(getStatusLabel(recommendationBadgeStatus(status), "sr")).toBe(label);
  });
});
