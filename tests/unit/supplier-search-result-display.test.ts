import { describe, expect, it } from "vitest";

import { hasSupplierSearchResultCards } from "../../components/search/search-result-display";
import { translateBusinessText } from "../../modules/i18n/translations";

const madeInChinaResult = {
  title: "USB-C Phone Charger",
  supplierName: "Shenzhen Charger Supplier",
  supplierCountry: "CN",
  price: 3.5,
  currency: "USD",
  minimumOrderQuantity: 100,
  incoterm: "FOB",
  productUrl: "https://charger.en.made-in-china.com/product/usb-c-charger.html",
  imageUrl: "https://image.made-in-china.com/usb-c-charger.webp",
  source: "Made-in-China",
};

describe("supplier search result display", () => {
  it("displays result cards when Made-in-China parsed results are present", () => {
    expect(hasSupplierSearchResultCards([madeInChinaResult])).toBe(true);
  });

  it("does not display result cards for an empty provider chain", () => {
    expect(hasSupplierSearchResultCards([])).toBe(false);
  });

  it("localizes live and cached result badges", () => {
    expect(translateBusinessText("Uživo", "en")).toBe("Live");
    expect(translateBusinessText("Keširano", "de")).toBe("Zwischengespeichert");
    expect(translateBusinessText("Keširani rezultat", "sr")).toBe("Keširani rezultat");
  });
});
