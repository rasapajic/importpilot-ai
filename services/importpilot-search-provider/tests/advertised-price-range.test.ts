import { describe, expect, it } from "vitest";

import { parseAdvertisedPriceBounds } from "../src/localized-number.js";

describe("advertised price bounds", () => {
  it("keeps both ends of a Made-in-China listing range", () => {
    expect(parseAdvertisedPriceBounds("US$1.20–2.90")).toEqual({ low: 1.2, high: 2.9 });
    expect(parseAdvertisedPriceBounds("US$ 1.72 - 1.78")).toEqual({ low: 1.72, high: 1.78 });
    expect(parseAdvertisedPriceBounds("US$ 0.28-0.45")).toEqual({ low: 0.28, high: 0.45 });
  });

  it("does not invent a high price from one number", () => {
    expect(parseAdvertisedPriceBounds("US$ 1.20")).toEqual({ low: 1.2, high: null });
    expect(parseAdvertisedPriceBounds(1.2)).toEqual({ low: 1.2, high: null });
    expect(parseAdvertisedPriceBounds("US$ 2.90-1.20")).toEqual({ low: 2.9, high: null });
  });
});
