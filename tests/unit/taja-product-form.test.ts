import { describe, expect, it } from "vitest";

import {
  classifyTajaOfferProductForm,
  evaluateTajaProductForm,
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
} from "../../modules/product-search/domain/taja-product-form";

const query = "Vodena magla za terasu sa pumpom i 20 mlaznica";

describe("TAJA product-form classification", () => {
  it("recognizes complete misting systems and kits", () => {
    for (const title of [
      "Patio Water Misting System with Pump and 20 Nozzles",
      "Adjustable Irrigation Kit DIY 10m Misting Cooling System Kit for Garden Patio",
      "M100 - 20 Nozzle Misting Kit",
      "Portable Outdoor Misting Cooling System",
    ]) {
      expect(classifyTajaOfferProductForm({ title }))
        .toBe(TajaOfferProductForms.COMPLETE_SYSTEM);
      expect(evaluateTajaProductForm(query, { title }).matchStatus)
        .toBe(TajaProductFormMatchStatuses.MATCH);
    }
  });

  it("separates nozzle-only offers from complete systems", () => {
    for (const title of [
      "Misting System Mist Nozzles Outdoor Nozzles for Outdoor Pool Cooling",
      "Misting System Mist Nozzles Outdoor Nozzles for Zoo Aquarium Cooling",
      "20 Brass Misting Nozzles Pack",
    ]) {
      const assessment = evaluateTajaProductForm(query, { title });
      expect(assessment).toMatchObject({
        form: TajaOfferProductForms.NOZZLES_ONLY,
        matchStatus: TajaProductFormMatchStatuses.MISMATCH,
      });
    }
  });

  it("separates pump-only and other component offers", () => {
    expect(evaluateTajaProductForm(query, {
      title: "12V High Pressure Water Pump Unit",
    })).toMatchObject({
      form: TajaOfferProductForms.PUMP_ONLY,
      matchStatus: TajaProductFormMatchStatuses.MISMATCH,
    });

    expect(evaluateTajaProductForm(query, {
      title: "10m Replacement Hose and Filter for Misting System",
    })).toMatchObject({
      form: TajaOfferProductForms.COMPONENT,
      matchStatus: TajaProductFormMatchStatuses.MISMATCH,
    });
  });

  it("keeps ambiguous titles separate until the kit contents are verified", () => {
    expect(evaluateTajaProductForm(query, {
      title: "Outdoor Cooling Equipment for Summer",
    })).toMatchObject({
      form: TajaOfferProductForms.UNCLEAR,
      matchStatus: TajaProductFormMatchStatuses.UNCLEAR,
    });
  });
});
