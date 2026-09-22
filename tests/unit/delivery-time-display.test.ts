import { describe, expect, it } from "vitest";

import { formatDeliveryTimeDays } from "../../components/search/simple-supplier-offer-search";

describe("supplier-result delivery time display", () => {
  it("labels Serbian ranges as days and normalizes the separator", () => {
    expect(formatDeliveryTimeDays("20-30", "sr")).toBe("20–30 dana");
  });

  it("uses the singular Serbian unit for one day", () => {
    expect(formatDeliveryTimeDays(1, "sr")).toBe("1 dan");
  });

  it("labels German and English delivery ranges", () => {
    expect(formatDeliveryTimeDays("20-30", "de")).toBe("20–30 Tage");
    expect(formatDeliveryTimeDays("20-30", "en")).toBe("20–30 days");
  });
});
