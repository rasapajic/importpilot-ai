import { describe, expect, it } from "vitest";

import type { SupplierSearchResult } from "../src/contract.js";
import {
  ExplicitSpecMismatchReasons,
  explicitSpecMismatchReasons,
  filterExplicitSpecMismatches,
} from "../src/explicit-spec-filter.js";

function result(title: string, index: number): SupplierSearchResult {
  return {
    title,
    supplierName: `Supplier ${index}`,
    supplierCountry: "CN",
    price: 1,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: `https://supplier-${index}.made-in-china.com/product-${index}.html`,
    imageUrl: null,
    source: "Made-in-China",
  };
}

describe("explicit supplier spec filter", () => {
  const query = "USB-C 100W braided cable, USB-C to USB-C, 1 m";

  it("removes the contradictory and ambiguous live-test results", () => {
    const candidates = [
      result("OEM Wholesale 1.5m Braided USB Type C Apple Cord Charger 3A 5A 60W 65W 100W PD3.0 Fast Charging USB C to USB C Cable for iPhone 15", 1),
      result("USB-C Fast Charging Cable 240W 100W 5A 1m 2m 3m Fast Charging USB Type C Cable Custom High Quality Braided Usb c to Type-C Kabel", 2),
      result("100W Charging Cable 3-In-1 Fast Charging Cable Type-C to USB with Nylon Braided 2-to-3 Data Cable Wholesale Price", 3),
      result("Joyroom SA21-1S Speedy Series for iPhone 15 Series 1.2m 3-in-1 Charging Cable 100W Nylon Braided USB-a to Type-C+Micro Fast Charging Cord", 4),
      result("OEM ODM Most Popular USB-C PD Cable 100W 5A Fast Charging Type C to Type C Braided Data Cable 1m/1.5m/2m", 5),
    ];

    expect(filterExplicitSpecMismatches(query, candidates)).toEqual([]);
  });

  it("rejects only explicit contradictions and preserves unknown specs", () => {
    expect(explicitSpecMismatchReasons(query, result("Braided USB-C PD Charging Cable", 1))).toEqual([]);
  });

  it("rejects a lower explicit power rating", () => {
    expect(
      explicitSpecMismatchReasons(query, result("60W USB-C to USB-C Braided Cable 1m", 1)),
    ).toContain(ExplicitSpecMismatchReasons.POWER);
  });

  it("rejects an explicit connector mismatch", () => {
    expect(
      explicitSpecMismatchReasons(query, result("100W USB-A to USB-C Braided Cable 1m", 1)),
    ).toContain(ExplicitSpecMismatchReasons.CONNECTOR);
  });

  it("rejects USB-C to DC and barrel-adapter listings from the live staging test", () => {
    const dcTitles = [
      "USB C to DC Jack Power Cable, Type-C Male to DC Female Barrel Connector Adapter, PD Trigger, 65W/100W Fast Charging, Nylon Braided",
      "Type-C to DC Power Cable, USB-C Male to 5.5x2.1mm/4.0x1.7mm DC Jack Charger Cord, 100W PD Trigger Cable for Lenovo/HP/DELL Laptops",
    ];

    for (const [index, title] of dcTitles.entries()) {
      expect(
        explicitSpecMismatchReasons(query, result(title, index + 10)),
      ).toContain(ExplicitSpecMismatchReasons.CONNECTOR);
    }
  });

  it("rejects a male-to-female extension when a normal USB-C to USB-C cable was requested", () => {
    expect(
      explicitSpecMismatchReasons(
        query,
        result("USB C Extension Cable 20Gbps USB3.2 Gen2x2 Type C Male to Female Extender 240W PD Fast Charging Nylon Braided Cable", 20),
      ),
    ).toContain(ExplicitSpecMismatchReasons.PRODUCT_FORM);
  });

  it("rejects a magnetic cable when a normal USB-C to USB-C cable was requested", () => {
    expect(
      explicitSpecMismatchReasons(
        query,
        result("100W USB-C to Type-C PD Magnetic Nylon Braided Charger Cable 1m", 21),
      ),
    ).toContain(ExplicitSpecMismatchReasons.PRODUCT_FORM);
  });

  it("keeps extension and magnetic forms when the user explicitly requests them", () => {
    expect(
      explicitSpecMismatchReasons(
        "USB-C to USB-C extension cable, 240W, 1 m",
        result("USB C Extension Cable Type C Male to Female Extender 240W 1m", 22),
      ),
    ).not.toContain(ExplicitSpecMismatchReasons.PRODUCT_FORM);

    expect(
      explicitSpecMismatchReasons(
        "magnetic USB-C to USB-C braided charging cable, 100W, 1 m",
        result("100W USB-C to Type-C PD Magnetic Nylon Braided Charger Cable 1m", 23),
      ),
    ).not.toContain(ExplicitSpecMismatchReasons.PRODUCT_FORM);
  });

  it("rejects a multi-length family even when it includes the requested length", () => {
    expect(
      explicitSpecMismatchReasons(query, result("240W USB-C to USB-C Braided Cable 1m 2m", 1)),
    ).toContain(ExplicitSpecMismatchReasons.LENGTH);
  });

  it("keeps a higher power rating when the exact requested length is the only advertised length", () => {
    expect(
      explicitSpecMismatchReasons(query, result("240W USB-C to USB-C Braided Cable 1m", 1)),
    ).toEqual([]);
  });

  it("does not treat repeated mentions of the same requested length as ambiguous", () => {
    expect(
      explicitSpecMismatchReasons(query, result("100W USB-C to USB-C 1m Braided Cable, cable length 1 meter", 1)),
    ).toEqual([]);
  });
});
