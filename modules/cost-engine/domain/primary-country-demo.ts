import { calculateLandedCost } from "./calculator";
import {
  getImportCountryProfile,
  type PrimaryImportCountryCode,
} from "./import-country-profiles";
import {
  createLandedCostAssumptions,
  sumCostAmounts,
  totalImportTransportCost,
} from "./serbia-landed-cost";

const BASE_DEMO_INPUT = {
  quantity: 100,
  unitPrice: "10.0000",
  currency: "EUR",
  incoterm: "FOB",
  chinaDomesticTransportCost: "100.00",
  internationalTransportCost: "800.00",
  insuranceCost: "50.00",
  customsBrokerCost: "150.00",
  customsDutyRate: "5.0000",
  storageCost: "80.00",
  inspectionCost: "100.00",
  otherCosts: "50.00",
  targetSellingPrice: "40.00",
} as const;

export type PrimaryCountryDemoScenario = ReturnType<typeof buildPrimaryCountryDemoScenario>;

export function buildPrimaryCountryDemoScenario(countryCode: PrimaryImportCountryCode) {
  const profile = getImportCountryProfile(countryCode);
  if (!profile) throw new Error(`Missing import country profile for ${countryCode}.`);

  const assumptions = createLandedCostAssumptions({
    countryCode,
    chinaDomesticTransportCost: BASE_DEMO_INPUT.chinaDomesticTransportCost,
    internationalTransportCost: BASE_DEMO_INPUT.internationalTransportCost,
    insuranceCost: BASE_DEMO_INPUT.insuranceCost,
    customsBrokerCost: BASE_DEMO_INPUT.customsBrokerCost,
    otherCosts: BASE_DEMO_INPUT.otherCosts,
    transportConfirmed: true,
    customsDutyConfirmed: true,
    vatSource: "COUNTRY_PROFILE_DEFAULT",
  });
  const shippingCost = totalImportTransportCost(assumptions);
  const calculation = calculateLandedCost({
    targetCountry: countryCode,
    quantity: BASE_DEMO_INPUT.quantity,
    unitPrice: BASE_DEMO_INPUT.unitPrice,
    currency: BASE_DEMO_INPUT.currency,
    incoterm: BASE_DEMO_INPUT.incoterm,
    shippingCost,
    customsDutyRate: BASE_DEMO_INPUT.customsDutyRate,
    vatRate: profile.defaultVatRate,
    storageCost: BASE_DEMO_INPUT.storageCost,
    inspectionCost: BASE_DEMO_INPUT.inspectionCost,
    customsBrokerCost: BASE_DEMO_INPUT.customsBrokerCost,
    otherCosts: BASE_DEMO_INPUT.otherCosts,
    targetSellingPrice: BASE_DEMO_INPUT.targetSellingPrice,
  });

  return {
    countryCode,
    countryProfileVersion: profile.version,
    vatRate: profile.defaultVatRate,
    projectName: `[DEMO][LANDED-COST][${countryCode}] Pametni organizatori`,
    supplierName: "Shenzhen Smart Storage Factory",
    quantity: BASE_DEMO_INPUT.quantity,
    targetMargin: 25,
    unitPrice: BASE_DEMO_INPUT.unitPrice,
    currency: BASE_DEMO_INPUT.currency,
    incoterm: BASE_DEMO_INPUT.incoterm,
    assumptions,
    calculation,
    persistedOtherCosts: sumCostAmounts([
      calculation.otherCosts,
      calculation.customsBrokerCost,
    ]),
  };
}
