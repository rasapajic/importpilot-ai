import { describe, expect, it } from "vitest";

import {
  estimateProductLogistics,
  estimateTransportRoutes,
  extractSupplierLogisticsData,
} from "../../modules/transport/domain/transport-estimator";

describe("smart transport cost estimation", () => {
  it("estimates a pocket-size product", () => {
    const estimate = estimateProductLogistics({
      productName: "phone charger type c",
      quantity: 100,
      sizeOption: "POCKET",
      weightOption: "UNDER_100G",
    });
    expect(estimate).not.toBeNull();
    if (!estimate) throw new Error("Expected a transport estimate.");

    expect(estimate.category).toBe("Phone charger");
    expect(estimate.estimatedWeightKg).toBe(8);
    expect(estimate.estimatedVolumeCbm).toBe(0.035);
    expect(estimate.confidence).toBe("HIGH");
  });

  it("estimates a book-size product", () => {
    const estimate = estimateProductLogistics({
      productName: "PTZ camera 3MP",
      quantity: 50,
      sizeOption: "BOOK",
      weightOption: "KG_0_5_2",
    });
    expect(estimate).not.toBeNull();
    if (!estimate) throw new Error("Expected a transport estimate.");

    expect(estimate.category).toBe("PTZ camera");
    expect(estimate.estimatedWeightKg).toBe(60);
    expect(estimate.estimatedVolumeCbm).toBe(0.06);
    expect(estimate.confidence).toBe("HIGH");
  });

  it("uses supplier weight and carton dimensions when available", () => {
    const estimate = estimateProductLogistics({
      productName: "unknown product",
      quantity: 100,
      supplierLogistics: {
        grossWeightKg: 12,
        cartonLengthCm: 40,
        cartonWidthCm: 30,
        cartonHeightCm: 20,
        piecesPerCarton: 20,
      },
    });
    expect(estimate).not.toBeNull();
    if (!estimate) throw new Error("Expected a transport estimate.");

    expect(estimate.source).toBe("SUPPLIER");
    expect(estimate.estimatedWeightKg).toBe(60);
    expect(estimate.estimatedVolumeCbm).toBe(0.12);
    expect(estimate.confidence).toBe("HIGH");
  });

  it("does not invent logistics when supplier and product data are unknown", () => {
    const estimate = estimateProductLogistics({
      productName: "custom accessory",
      quantity: 10,
    });

    expect(estimate).toBeNull();
  });

  it("returns Air, Rail and Sea estimates", () => {
    const estimate = estimateProductLogistics({
      productName: "LED light",
      quantity: 200,
      sizeOption: "SHOEBOX",
      weightOption: "G_100_500",
    });
    expect(estimate).not.toBeNull();
    const routes = estimateTransportRoutes(estimate!);

    expect(routes.map((route) => route.mode)).toEqual(["AIR", "RAIL", "SEA"]);
    expect(routes.every((route) => route.estimatedCostEur > 0)).toBe(true);
    expect(routes[0].deliveryTimeDays).toBe("7-10");
  });

  it("marks unsuitable modes with lower confidence", () => {
    const estimate = estimateProductLogistics({
      productName: "solar panel",
      quantity: 100,
    });
    expect(estimate).not.toBeNull();
    const routes = estimateTransportRoutes(estimate!);

    expect(routes.find((route) => route.mode === "AIR")?.confidence).toBe("LOW");
  });

  it("extracts supplier logistics from source metadata", () => {
    expect(extractSupplierLogisticsData({
      logistics: {
        gross_weight_kg: "10.5",
        carton_length_cm: "50",
        carton_width_cm: "40",
        carton_height_cm: "30",
        pieces_per_carton: "25",
      },
    })).toEqual({
      grossWeightKg: 10.5,
      netWeightKg: null,
      cartonLengthCm: 50,
      cartonWidthCm: 40,
      cartonHeightCm: 30,
      piecesPerCarton: 25,
    });
  });

  it("keeps rail and sea calculations distinct for 1,000 glasses and yields the accepted sea estimate", () => {
    const estimate = estimateProductLogistics({
      productName: "Zaštitne naočare",
      quantity: 1000,
      sizeOption: "BOOK",
      weightOption: "G_100_500",
    });
    expect(estimate).not.toBeNull();
    const routes = estimateTransportRoutes(estimate!);
    const rail = routes.find((route) => route.mode === "RAIL");
    const sea = routes.find((route) => route.mode === "SEA");

    expect(estimate).toMatchObject({ estimatedWeightKg: 300, estimatedVolumeCbm: 1.2, confidence: "HIGH" });
    expect(sea?.estimatedCostEur).toBe(225);
    expect(rail?.estimatedCostEur).toBe(350);
    expect(rail?.estimatedCostEur).not.toBe(sea?.estimatedCostEur);
  });

  it("explains equal rail and sea prices when both use the configured minimum charge", () => {
    const estimate = estimateProductLogistics({
      productName: "Zaštitne naočare",
      quantity: 1000,
      sizeOption: "BOOK",
      weightOption: "UNDER_100G",
    });
    expect(estimate).not.toBeNull();
    const routes = estimateTransportRoutes(estimate!);
    const rail = routes.find((route) => route.mode === "RAIL");
    const sea = routes.find((route) => route.mode === "SEA");

    expect(rail).toMatchObject({
      estimatedCostEur: 225,
      minimumCostEur: 225,
      minimumApplied: true,
      priceBeforeMinimumEur: 224,
      pricingBasis: "VOLUME",
      pricingBasisValue: 1.2,
    });
    expect(sea).toMatchObject({
      estimatedCostEur: 225,
      minimumCostEur: 225,
      minimumApplied: true,
      priceBeforeMinimumEur: 222,
      pricingBasis: "VOLUME",
      pricingBasisValue: 1.2,
    });
  });

  it("keeps charger and LED estimates isolated by product", () => {
    const charger = estimateProductLogistics({ productName: "USB-C phone charger", quantity: 100 });
    const light = estimateProductLogistics({ productName: "LED light", quantity: 100 });

    expect(charger).toMatchObject({
      category: "Phone charger",
      estimatedWeightKg: 8,
      estimatedVolumeCbm: 0.035,
    });
    expect(light).toMatchObject({
      category: "LED light",
      estimatedWeightKg: 35,
      estimatedVolumeCbm: 0.25,
    });
  });
});
