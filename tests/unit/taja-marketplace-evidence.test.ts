import { describe, expect, it } from "vitest";

import {
  evaluateTajaProductForm,
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
} from "../../modules/product-search/domain/taja-product-form";
import {
  evaluateTajaRequirementMatch,
  TajaRequirementMatchStatuses,
} from "../../modules/product-search/domain/taja-requirement-match";
import type { SupplierOfferMarketplaceDetails } from "../../modules/product-search/domain/search";

const query = "Vodena magla za terasu sa pumpom i 20 mlaznica";

function details(
  attributes: Array<{ name: string; value: string }>,
): SupplierOfferMarketplaceDetails {
  return {
    adapter: "made-in-china-product-page-v1",
    evidence: "PRODUCT_PAGE",
    priceTiers: [],
    attributes,
    variants: [],
    packaging: null,
  };
}

describe("TAJA exact-page marketplace evidence", () => {
  it("confirms requirements omitted from the title when product-page facts prove them", () => {
    const result = {
      title: "Outdoor Misting Cooling System",
      marketplaceDetails: details([
        { name: "Application", value: "Patio and terrace" },
        { name: "Kit Contents", value: "High-pressure pump and 20 brass misting nozzles" },
      ]),
    };

    expect(evaluateTajaRequirementMatch(query, result)).toMatchObject({
      status: TajaRequirementMatchStatuses.FULL,
    });
    expect(evaluateTajaProductForm(query, result)).toMatchObject({
      form: TajaOfferProductForms.COMPLETE_SYSTEM,
      matchStatus: TajaProductFormMatchStatuses.MATCH,
    });
  });

  it("does not turn compatibility text into proof of a complete kit", () => {
    const result = {
      title: "Misting System Mist Nozzles",
      marketplaceDetails: details([
        { name: "Compatibility", value: "Suitable for high-pressure pump systems" },
        { name: "Selling Unit", value: "Nozzle" },
      ]),
    };

    expect(evaluateTajaProductForm(query, result)).toMatchObject({
      form: TajaOfferProductForms.UNCLEAR,
      matchStatus: TajaProductFormMatchStatuses.UNCLEAR,
    });
    expect(evaluateTajaRequirementMatch(query, result).status)
      .toBe(TajaRequirementMatchStatuses.PARTIAL);
  });
});
