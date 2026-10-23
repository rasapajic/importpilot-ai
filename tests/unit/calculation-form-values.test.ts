import { CalculationStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getCalculationFormValues } from "../../modules/cost-engine/application/calculation-form-values";
import { costCalculationRequestSchema } from "../../modules/cost-engine/domain/validation";
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
      chinaDomesticTransportCost: "",
      internationalTransportCost: "120.5",
      insuranceCost: "",
      customsBrokerCost: "",
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

  it("keeps a new form empty instead of filling unknown costs with zero", () => {
    const values = getCalculationFormValues();

    expect(values.shippingCost).toBe("");
    expect(values.chinaDomesticTransportCost).toBe("");
    expect(values.insuranceCost).toBe("");
    expect(values.customsBrokerCost).toBe("");
    expect(values.customsDutyRate).toBe("");
    expect(values.storageCost).toBe("");
    expect(values.inspectionCost).toBe("");
    expect(values.otherCosts).toBe("");
    expect(values.shippingCost).not.toBe("0.00");
    expect(values.insuranceCost).not.toBe("0.00");
  });

  it("keeps an explicit stored zero distinct from an empty unknown cost", () => {
    const values = getCalculationFormValues({
      shippingCost: new Prisma.Decimal("0.00"),
      insuranceCost: new Prisma.Decimal("0"),
      customsDutyRate: new Prisma.Decimal("0"),
      storageCost: new Prisma.Decimal("0.00"),
      inspectionCost: new Prisma.Decimal("0.00"),
      otherCosts: new Prisma.Decimal("0.00"),
      targetSellingPrice: new Prisma.Decimal("0.00"),
      calculationStatus: CalculationStatus.CALCULATED,
    } as never);

    expect(values.shippingCost).not.toBe("");
    expect(Number(values.shippingCost)).toBe(0);
    expect(values.insuranceCost).not.toBe("");
    expect(Number(values.insuranceCost)).toBe(0);
    expect(Number(values.customsDutyRate)).toBe(0);
  });

  it("keeps a stored unknown cost empty instead of zero", () => {
    const calculation = {
      shippingCost: null,
      insuranceCost: null,
      customsDutyRate: null,
      vatRate: null,
      storageCost: null,
      inspectionCost: null,
      otherCosts: null,
      targetSellingPrice: null,
      calculationStatus: CalculationStatus.DRAFT,
    };

    const values = getCalculationFormValues(calculation as never);

    expect(values).toMatchObject({
      shippingCost: "",
      internationalTransportCost: "",
      insuranceCost: "",
      customsDutyRate: "",
      vatRate: "",
      storageCost: "",
      inspectionCost: "",
      otherCosts: "",
      targetSellingPrice: "",
    });
    expect(values.shippingCost).not.toBe("0.00");
    expect(values.insuranceCost).not.toBe("0.00");
    expect(values.otherCosts).not.toBe("0.00");
  });

  it("does not turn an omitted or blank request cost into zero", () => {
    const required = {
      customsDutyRate: "5",
      vatRate: "20",
      storageCost: "30.00",
      inspectionCost: "20.00",
      otherCosts: "10.00",
      targetSellingPrice: "20.00",
    };
    const omitted = costCalculationRequestSchema.parse(required);
    expect(omitted.shippingCost).toBeUndefined();
    expect(omitted.insuranceCost).toBeUndefined();
    expect(omitted.chinaDomesticTransportCost).toBeUndefined();
    expect(omitted.internationalTransportCost).toBeUndefined();
    expect(omitted.customsBrokerCost).toBeUndefined();

    const blank = costCalculationRequestSchema.parse({
      ...required,
      shippingCost: "",
      insuranceCost: null,
      customsBrokerCost: undefined,
    });
    expect(blank.shippingCost).toBeUndefined();
    expect(blank.insuranceCost).toBeUndefined();
    expect(blank.customsBrokerCost).toBeUndefined();

    const explicit = costCalculationRequestSchema.parse({
      ...required,
      shippingCost: "0.00",
      insuranceCost: "0",
      chinaDomesticTransportCost: "0.00",
      internationalTransportCost: "0",
      customsBrokerCost: "0.00",
    });
    expect(explicit.shippingCost).toBe("0.00");
    expect(explicit.insuranceCost).toBe("0");
    expect(explicit.chinaDomesticTransportCost).toBe("0.00");
    expect(explicit.internationalTransportCost).toBe("0");
    expect(explicit.customsBrokerCost).toBe("0.00");
  });

  it("translates the recalculation CTA", () => {
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "en")).toBe("Edit calculation values");
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "de")).toBe("Kalkulationswerte bearbeiten");
    expect(translateBusinessText("Izmeni vrednosti za kalkulaciju", "sr")).toBe("Izmeni vrednosti za kalkulaciju");
  });
});
