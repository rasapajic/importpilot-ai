import { CalculationStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getCalculationFormValues } from "../../modules/cost-engine/application/calculation-form-values";
import { createLandedCostAssumptions } from "../../modules/cost-engine/domain/serbia-landed-cost";
import { translateBusinessText } from "../../modules/i18n/translations";

describe("calculation edit values", () => {
  it("restores all editable values from the latest calculation", () => {
    const calculation = {
      shippingCost: new Prisma.Decimal("120.50"),
      customsDutyRate: new Prisma.Decimal("8.25"),
      vatRate: new Prisma.Decimal("20"),
      storageCost: new Prisma.Decimal("30"),
      inspectionCost: new Prisma.Decimal("15"),
      otherCosts: new Prisma.Decimal("5"),
      targetSellingPrice: new Prisma.Decimal("25"),
      calculationStatus: CalculationStatus.NEEDS_REVIEW,
    };

    expect(getCalculationFormValues(calculation as never)).toEqual({
      shippingCost: "120.5",
      chinaDomesticTransportCost: "0.00",
      internationalTransportCost: "120.5",
      insuranceCost: "0.00",
      customsBrokerCost: "0.00",
      customsDutyRate: "8.25",
      vatRate: "20",
      vatSource: "COUNTRY_DEFAULT",
      storageCost: "30",
      inspectionCost: "15",
      otherCosts: "5",
      targetSellingPrice: "25",
      transportConfirmed: false,
      customsDutyConfirmed: false,
      needsReview: true,
    });
  });

  it("restores a versioned country transport and clearance breakdown", () => {
    const calculation = {
      shippingCost: new Prisma.Decimal("160"),
      customsDutyRate: new Prisma.Decimal("5"),
      vatRate: new Prisma.Decimal("20"),
      storageCost: new Prisma.Decimal("30"),
      inspectionCost: new Prisma.Decimal("20"),
      otherCosts: new Prisma.Decimal("50"),
      targetSellingPrice: new Prisma.Decimal("25"),
      calculationStatus: CalculationStatus.CALCULATED,
    };
    const assumptions = createLandedCostAssumptions({
      countryCode: "AT",
      chinaDomesticTransportCost: "50.00",
      internationalTransportCost: "100.00",
      insuranceCost: "10.00",
      customsBrokerCost: "40.00",
      otherCosts: "10.00",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      vatSource: "COUNTRY_PROFILE_DEFAULT",
    });

    expect(getCalculationFormValues(calculation as never, assumptions)).toMatchObject({
      chinaDomesticTransportCost: "50.00",
      internationalTransportCost: "100.00",
      insuranceCost: "10.00",
      customsBrokerCost: "40.00",
      otherCosts: "10.00",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      vatSource: "COUNTRY_PROFILE_DEFAULT",
    });
  });

  it("translates the recalculation CTA", () => {
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "en")).toBe("Edit calculation values");
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "de")).toBe("Kalkulationswerte bearbeiten");
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "sr")).toBe("Izmeni vrednosti za kalkulaciju");
  });
});
