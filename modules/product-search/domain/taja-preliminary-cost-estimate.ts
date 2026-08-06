import { getImportCountryProfile } from "../../cost-engine/domain/import-country-profiles";
import {
  DEFAULT_EUR_FX_SNAPSHOT,
  convertToEur,
} from "../../fx/euro-display";
import {
  estimateProductLogistics,
  estimateTransportRoutes,
  type TransportConfidence,
  type TransportMode,
} from "../../transport/domain/transport-estimator";
import type { SupplierOfferSearchResult } from "./search";

export const TAJA_PRELIMINARY_COST_ESTIMATE_VERSION =
  "TAJA_PRELIMINARY_LANDED_COST_V1" as const;

export type TajaPreliminaryCostWarning =
  | "CUSTOMS_CLASSIFICATION_REQUIRED"
  | "TRANSPORT_ESTIMATE_NOT_QUOTE"
  | "FX_REFERENCE_RATE"
  | "VAT_RECOVERABILITY_NOT_MODELED"
  | "ANTIDUMPING_NOT_INCLUDED"
  | "GENERIC_HANDLING_ASSUMPTIONS"
  | "SUPPLIER_ORIGIN_ASSUMED_CHINA"
  | "LOW_LOGISTICS_CONFIDENCE";

export type TajaPreliminaryCostEstimate = {
  version: typeof TAJA_PRELIMINARY_COST_ESTIMATE_VERSION;
  currency: "EUR";
  lowPerUnitEur: number;
  basePerUnitEur: number;
  highPerUnitEur: number;
  requiredSellingPriceBaseEur: number | null;
  goodsCostEur: number;
  transportMode: TransportMode;
  transportCostEur: number;
  deliveryTimeDays: string;
  confidence: TransportConfidence;
  vatRatePercent: number;
  customsDutyRateScenarios: readonly [0, 5, 10];
  fxSource: string;
  fxTimestamp: string;
  assumptions: string[];
  warnings: TajaPreliminaryCostWarning[];
};

const HANDLING_ASSUMPTIONS_EUR = {
  RS: { broker: 150, storage: 80, inspection: 100, other: 50 },
  AT: { broker: 180, storage: 80, inspection: 100, other: 50 },
  DE: { broker: 180, storage: 80, inspection: 100, other: 50 },
} as const;

const CONFIDENCE_ORDER: Record<TransportConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function chooseTransportRoute(
  routes: ReturnType<typeof estimateTransportRoutes>,
) {
  return [...routes].sort((left, right) =>
    CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence] ||
    left.estimatedCostEur - right.estimatedCostEur,
  )[0] ?? null;
}

function scenarioTotal(input: {
  goodsCostEur: number;
  transportCostEur: number;
  originHandlingEur: number;
  insuranceEur: number;
  brokerEur: number;
  storageEur: number;
  inspectionEur: number;
  otherEur: number;
  customsDutyRate: number;
  vatRate: number;
}) {
  const customsBase = input.goodsCostEur + input.transportCostEur +
    input.originHandlingEur + input.insuranceEur;
  const customsDuty = customsBase * input.customsDutyRate / 100;
  const vatBase = customsBase + customsDuty + input.brokerEur +
    input.inspectionEur + input.otherEur;
  const vat = vatBase * input.vatRate / 100;
  return customsBase + customsDuty + vat + input.brokerEur +
    input.storageEur + input.inspectionEur + input.otherEur;
}

function supportedIncoterm(incoterm: string | null) {
  return incoterm !== null && ["EXW", "FCA", "FAS", "FOB"].includes(incoterm);
}

function isChinaMarketplaceResult(result: SupplierOfferSearchResult) {
  try {
    const host = new URL(result.productUrl).hostname.toLowerCase().replace(/^www\./, "");
    return host === "1688.com" || host.endsWith(".1688.com") ||
      host === "alibaba.com" || host.endsWith(".alibaba.com") ||
      host === "made-in-china.com" || host.endsWith(".made-in-china.com");
  } catch {
    return false;
  }
}

function chinaOriginStatus(result: SupplierOfferSearchResult) {
  if (result.supplierCountry === "CN") return "CONFIRMED" as const;
  if (result.supplierCountry === null && isChinaMarketplaceResult(result)) {
    return "ASSUMED_MARKETPLACE" as const;
  }
  return "UNSUPPORTED" as const;
}

/**
 * Produces a transparent planning range, never a confirmed landed cost.
 * The estimate is deliberately limited to China-origin EXW/FCA/FAS/FOB offers
 * and the existing RS/AT/DE profiles. Product classification, freight quote,
 * anti-dumping measures and VAT recoverability still require confirmation.
 */
export function estimateTajaPreliminaryLandedCost(input: {
  result: SupplierOfferSearchResult;
  quantity: number;
  targetCountry: string;
  targetMarginPercent: number;
}): TajaPreliminaryCostEstimate | null {
  const { result, quantity, targetCountry, targetMarginPercent } = input;
  const profile = getImportCountryProfile(targetCountry);
  const originStatus = chinaOriginStatus(result);
  if (!profile || quantity <= 0 || !Number.isInteger(quantity)) return null;
  if (originStatus === "UNSUPPORTED") return null;
  if (!supportedIncoterm(result.incoterm)) return null;
  if (result.price === null || result.currency === null || result.price <= 0) return null;

  const unitPriceEur = convertToEur(result.price, result.currency);
  if (unitPriceEur === null || unitPriceEur <= 0) return null;
  const goodsCostEur = unitPriceEur * quantity;
  const logistics = estimateProductLogistics({
    productName: result.title,
    quantity,
  });
  const route = chooseTransportRoute(estimateTransportRoutes(logistics));
  if (!route) return null;

  const handling = HANDLING_ASSUMPTIONS_EUR[profile.countryCode];
  const originHandlingEur = Math.max(35, goodsCostEur * 0.015);
  const insuranceEur = (goodsCostEur + route.estimatedCostEur + originHandlingEur) * 0.01;
  const common = {
    goodsCostEur,
    transportCostEur: route.estimatedCostEur,
    originHandlingEur,
    insuranceEur,
    brokerEur: handling.broker,
    storageEur: handling.storage,
    inspectionEur: handling.inspection,
    otherEur: handling.other,
    vatRate: Number(profile.defaultVatRate),
  };
  const lowTotal = scenarioTotal({ ...common, customsDutyRate: 0 });
  const baseTotal = scenarioTotal({ ...common, customsDutyRate: 5 });
  const highTotal = scenarioTotal({ ...common, customsDutyRate: 10 });
  const basePerUnitEur = baseTotal / quantity;
  const requiredSellingPriceBaseEur =
    targetMarginPercent >= 0 && targetMarginPercent < 100
      ? basePerUnitEur / (1 - targetMarginPercent / 100)
      : null;
  const warnings: TajaPreliminaryCostWarning[] = [
    "CUSTOMS_CLASSIFICATION_REQUIRED",
    "TRANSPORT_ESTIMATE_NOT_QUOTE",
    "FX_REFERENCE_RATE",
    "VAT_RECOVERABILITY_NOT_MODELED",
    "ANTIDUMPING_NOT_INCLUDED",
    "GENERIC_HANDLING_ASSUMPTIONS",
  ];
  if (originStatus === "ASSUMED_MARKETPLACE") {
    warnings.push("SUPPLIER_ORIGIN_ASSUMED_CHINA");
  }
  if (route.confidence === "LOW") warnings.push("LOW_LOGISTICS_CONFIDENCE");

  return {
    version: TAJA_PRELIMINARY_COST_ESTIMATE_VERSION,
    currency: "EUR",
    lowPerUnitEur: round(lowTotal / quantity),
    basePerUnitEur: round(basePerUnitEur),
    highPerUnitEur: round(highTotal / quantity),
    requiredSellingPriceBaseEur: requiredSellingPriceBaseEur === null
      ? null
      : round(requiredSellingPriceBaseEur),
    goodsCostEur: round(goodsCostEur),
    transportMode: route.mode,
    transportCostEur: round(route.estimatedCostEur),
    deliveryTimeDays: route.deliveryTimeDays,
    confidence: route.confidence,
    vatRatePercent: Number(profile.defaultVatRate),
    customsDutyRateScenarios: [0, 5, 10],
    fxSource: DEFAULT_EUR_FX_SNAPSHOT.source,
    fxTimestamp: DEFAULT_EUR_FX_SNAPSHOT.timestamp,
    assumptions: [
      originStatus === "ASSUMED_MARKETPLACE"
        ? "Supplier country is missing; China is assumed only because the offer is on a China marketplace."
        : "Supplier origin: China.",
      `Origin handling: ${round(originHandlingEur)} EUR.`,
      `Insurance: ${round(insuranceEur)} EUR.`,
      `Broker/storage/inspection/other: ${handling.broker}/${handling.storage}/${handling.inspection}/${handling.other} EUR.`,
      `VAT profile: ${profile.version}.`,
      ...route.reasons,
    ],
    warnings,
  };
}
