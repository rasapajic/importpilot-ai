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

    expect(estimate.source).toBe("SUPPLIER");
    expect(estimate.estimatedWeightKg).toBe(60);
    expect(estimate.estimatedVolumeCbm).toBe(0.12);
    expect(estimate.confidence).toBe("HIGH");
  });

  it("falls back when supplier weight is not available", () => {
    const estimate = estimateProductLogistics({
      productName: "custom accessory",
      quantity: 10,
    });

    expect(estimate.source).toBe("FALLBACK");
    expect(estimate.confidence).toBe("LOW");
  });

  it("returns Air, Rail and Sea estimates", () => {
    const routes = estimateTransportRoutes(estimateProductLogistics({
      productName: "LED light",
      quantity: 200,
      sizeOption: "SHOEBOX",
      weightOption: "G_100_500",
    }));

    expect(routes.map((route) => route.mode)).toEqual(["AIR", "RAIL", "SEA"]);
    expect(routes.every((route) => route.estimatedCostEur > 0)).toBe(true);
    expect(routes[0].deliveryTimeDays).toBe("7-10");
  });

  it("marks unsuitable modes with lower confidence", () => {
    const routes = estimateTransportRoutes(estimateProductLogistics({
      productName: "solar panel",
      quantity: 100,
    }));

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
});
