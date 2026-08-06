import { getImportCountryProfile } from "../../cost-engine/domain/import-country-profiles";
import {
  DEFAULT_EUR_FX_SNAPSHOT,
  convertToEur,
} from "../../fx/euro-display";
import {
  estimateProductLogistics,
  estimateTransportRoutes,
  type ProductLogisticsEstimate,
  type TransportConfidence,
  type TransportMode,
} from "../../transport/domain/transport-estimator";
import type { SupplierOfferSearchResult } from "./search";

export const TAJA_PRELIMINARY_COST_ESTIMATE_VERSION =
  "TAJA_PRELIMINARY_LANDED_COST_V3" as const;

type SupportedOriginIncoterm = "EXW" | "FCA" | "FAS" | "FOB";

export type TajaPreliminaryCostWarning =
  | "CUSTOMS_CLASSIFICATION_REQUIRED"
  | "TRANSPORT_ESTIMATE_NOT_QUOTE"
  | "FX_REFERENCE_RATE"
  | "VAT_RECOVERABILITY_NOT_MODELED"
  | "ANTIDUMPING_NOT_INCLUDED"
  | "GENERIC_HANDLING_ASSUMPTIONS"
  | "SUPPLIER_ORIGIN_ASSUMED_CHINA"
  | "INCOTERM_ASSUMED_EXW_FOR_1688"
  | "CHINA_DOMESTIC_TRANSPORT_ASSUMED"
  | "SOURCING_AGENT_FEE_ASSUMED"
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
  chinaDomesticTransportEur: number;
  sourcingAgentFeeEur: number;
  deliveryTimeDays: string;
  confidence: TransportConfidence;
  pricingBasisIncoterm: SupportedOriginIncoterm;
  pricingBasisAssumed: boolean;
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
  chinaDomesticTransportEur: number;
  sourcingAgentFeeEur: number;
  originHandlingEur: number;
  insuranceEur: number;
  brokerEur: number;
  storageEur: number;
  inspectionEur: number;
  otherEur: number;
  customsDutyRate: number;
  vatRate: number;
}) {
  const customsBase = input.goodsCostEur + input.chinaDomesticTransportEur +
    input.transportCostEur + input.originHandlingEur + input.insuranceEur;
  const customsDuty = customsBase * input.customsDutyRate / 100;
  const vatBase = customsBase + customsDuty + input.brokerEur +
    input.inspectionEur + input.otherEur;
  const vat = vatBase * input.vatRate / 100;
  return customsBase + customsDuty + vat + input.sourcingAgentFeeEur +
    input.brokerEur + input.storageEur + input.inspectionEur + input.otherEur;
}

function is1688Result(result: SupplierOfferSearchResult) {
  try {
    const host = new URL(result.productUrl).hostname.toLowerCase().replace(/^www\./, "");
    return host === "1688.com" || host.endsWith(".1688.com");
  } catch {
    return false;
  }
}

function pricingBasis(result: SupplierOfferSearchResult) {
  if (
    result.incoterm === "EXW" ||
    result.incoterm === "FCA" ||
    result.incoterm === "FAS" ||
    result.incoterm === "FOB"
  ) {
    return { incoterm: result.incoterm, assumed: false } as const;
  }
  if (result.incoterm === null && is1688Result(result)) {
    return { incoterm: "EXW", assumed: true } as const;
  }
  return null;
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

function chinaDomesticPlanningCosts(input: {
  result: SupplierOfferSearchResult;
  basis: { incoterm: SupportedOriginIncoterm; assumed: boolean };
  goodsCostEur: number;
  logistics: ProductLogisticsEstimate;
}) {
  const applies = is1688Result(input.result) && input.basis.incoterm === "EXW";
  if (!applies) {
    return {
      applies: false,
      chinaDomesticTransportEur: 0,
      sourcingAgentFeeEur: 0,
    } as const;
  }

  return {
    applies: true,
    chinaDomesticTransportEur: Math.max(
      30,
      input.logistics.estimatedWeightKg * 0.12,
      input.logistics.estimatedVolumeCbm * 45,
    ),
    sourcingAgentFeeEur: Math.max(35, input.goodsCostEur * 0.05),
  } as const;
}

function estimateConfidence(
  routeConfidence: TransportConfidence,
  hasUnquotedChinaDomesticCosts: boolean,
): TransportConfidence {
  if (hasUnquotedChinaDomesticCosts && routeConfidence === "HIGH") return "MEDIUM";
  return routeConfidence;
}

/**
 * Produces a transparent planning range, never a confirmed landed cost.
 * The estimate is limited to China-origin offers and the existing RS/AT/DE
 * profiles. A 1688 domestic quote without an explicit Incoterm may use an
 * explicitly disclosed EXW planning basis, but can never unlock FINAL status.
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
  const basis = pricingBasis(result);
  if (!profile || quantity <= 0 || !Number.isInteger(quantity)) return null;
  if (originStatus === "UNSUPPORTED" || !basis) return null;
  if (result.price === null || result.currency === null || result.price <= 0) return null;

  const unitPriceEur = convertToEur(result.price, result.currency);
  if (unitPriceEur === null || unitPriceEur <= 0) return null;
  const goodsCostEur = unitPriceEur * quantity;
  const logistics = estimateProductLogistics({
    productName: result.title,
    quantity,
    supplierLogistics: result.supplierLogistics ?? null,
  });
  const route = chooseTransportRoute(estimateTransportRoutes(logistics));
  if (!route) return null;

  const chinaDomestic = chinaDomesticPlanningCosts({
    result,
    basis,
    goodsCostEur,
    logistics,
  });
  const confidence = estimateConfidence(route.confidence, chinaDomestic.applies);
  const handling = HANDLING_ASSUMPTIONS_EUR[profile.countryCode];
  const originHandlingEur = Math.max(35, goodsCostEur * 0.015);
  const insuranceEur = (
    goodsCostEur + chinaDomestic.chinaDomesticTransportEur +
    route.estimatedCostEur + originHandlingEur
  ) * 0.01;
  const common = {
    goodsCostEur,
    transportCostEur: route.estimatedCostEur,
    chinaDomesticTransportEur: chinaDomestic.chinaDomesticTransportEur,
    sourcingAgentFeeEur: chinaDomestic.sourcingAgentFeeEur,
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
  if (basis.assumed) warnings.push("INCOTERM_ASSUMED_EXW_FOR_1688");
  if (chinaDomestic.applies) {
    warnings.push(
      "CHINA_DOMESTIC_TRANSPORT_ASSUMED",
      "SOURCING_AGENT_FEE_ASSUMED",
    );
  }
  if (confidence === "LOW") warnings.push("LOW_LOGISTICS_CONFIDENCE");

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
    chinaDomesticTransportEur: round(chinaDomestic.chinaDomesticTransportEur),
    sourcingAgentFeeEur: round(chinaDomestic.sourcingAgentFeeEur),
    deliveryTimeDays: route.deliveryTimeDays,
    confidence,
    pricingBasisIncoterm: basis.incoterm,
    pricingBasisAssumed: basis.assumed,
    vatRatePercent: Number(profile.defaultVatRate),
    customsDutyRateScenarios: [0, 5, 10],
    fxSource: DEFAULT_EUR_FX_SNAPSHOT.source,
    fxTimestamp: DEFAULT_EUR_FX_SNAPSHOT.timestamp,
    assumptions: [
      originStatus === "ASSUMED_MARKETPLACE"
        ? "Supplier country is missing; China is assumed only because the offer is on a China marketplace."
        : "Supplier origin: China.",
      basis.assumed
        ? "1688 domestic quote has no explicit Incoterm; EXW is used only as a preliminary planning basis."
        : `Pricing basis: ${basis.incoterm}.`,
      ...(chinaDomestic.applies
        ? [
            `1688 domestic China transport: ${round(chinaDomestic.chinaDomesticTransportEur)} EUR (planning estimate, not a carrier quote).`,
            `1688 sourcing/warehouse agent: ${round(chinaDomestic.sourcingAgentFeeEur)} EUR (5% of goods, minimum 35 EUR planning assumption).`,
          ]
        : []),
      `Export/consolidation handling: ${round(originHandlingEur)} EUR.`,
      `Insurance: ${round(insuranceEur)} EUR.`,
      `Broker/storage/inspection/other: ${handling.broker}/${handling.storage}/${handling.inspection}/${handling.other} EUR.`,
      `VAT profile: ${profile.version}.`,
      ...route.reasons,
    ],
    warnings,
  };
}
