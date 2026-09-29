import type { RecommendationStatusValue } from "./recommendation";
import {
  convertToEur,
  DEFAULT_EUR_FX_SNAPSHOT,
  getFxSnapshotStatus,
  type FxSnapshot,
} from "../../fx/euro-display";

export type ComparableOffer = {
  offerId: string;
  supplierName: string;
  currency: string | null;
  landedCostTotal: number | null;
  grossMarginPercent: number | null;
  deliveryTimeDays: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
  recommendationStatus: RecommendationStatusValue | null;
  analyzed?: boolean;
  assessmentReliable?: boolean;
  complete?: boolean;
  exclusionReasons?: string[];
  landedCostTotalEur?: number | null;
};

export type ComparisonGroup = {
  currency: string;
  offers: ComparableOffer[];
  bestTotalCost: ComparableOffer | null;
  lowestRisk: ComparableOffer | null;
  fastestDelivery: ComparableOffer | null;
  bestForResale: ComparableOffer | null;
};

export type OfferComparison = {
  groups: ComparisonGroup[];
  excluded: Array<{ offerId: string; supplierName: string; reasons: string[] }>;
  fxReliable: boolean;
};

function minBy(items: ComparableOffer[], value: (item: ComparableOffer) => number | null) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => value(a)! - value(b)!)[0] ?? null;
}

function riskValue(item: ComparableOffer) {
  return item.supplierRiskScore ?? Number.MAX_SAFE_INTEGER;
}

function minByWithRiskTieBreak(
  items: ComparableOffer[],
  value: (item: ComparableOffer) => number | null,
) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => {
      const first = value(a)!;
      const second = value(b)!;
      const tolerance = Math.max(1, Math.abs(first) * 0.03);
      if (Math.abs(first - second) <= tolerance) return riskValue(a) - riskValue(b);
      return first - second;
    })[0] ?? null;
}

function maxByWithRiskTieBreak(
  items: ComparableOffer[],
  value: (item: ComparableOffer) => number | null,
) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => {
      const first = value(a)!;
      const second = value(b)!;
      if (Math.abs(first - second) <= 2) return riskValue(a) - riskValue(b);
      return second - first;
    })[0] ?? null;
}

function buildGroup(currency: string, offers: ComparableOffer[]): ComparisonGroup {
  const enoughForWinner = offers.length >= 2;
  return {
    currency,
    offers,
    bestTotalCost: enoughForWinner ? minByWithRiskTieBreak(offers, (offer) => offer.landedCostTotal) : null,
    lowestRisk: enoughForWinner ? minBy(offers, (offer) => offer.supplierRiskScore) : null,
    fastestDelivery: enoughForWinner ? minBy(offers, (offer) => offer.deliveryTimeDays) : null,
    bestForResale: enoughForWinner ? maxByWithRiskTieBreak(offers, (offer) => offer.grossMarginPercent) : null,
  };
}

export function compareOffers(
  offers: ComparableOffer[],
  fx: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
  now: Date = new Date(),
): OfferComparison {
  const excluded: OfferComparison["excluded"] = [];
  const eligible = offers.flatMap((offer) => {
    const reasons = [...(offer.exclusionReasons ?? [])];
    const analyzed = offer.analyzed ?? offer.recommendationStatus !== null;
    if (offer.complete === false) {
      reasons.push(analyzed
        ? "Ponuda je privremeno analizirana, ali nije podobna za rangiranje dok se ne potvrde svi obavezni troškovi."
        : "Ponuda nema kompletan potvrđen obračun.");
    }
    if (!analyzed) reasons.push("Ponuda nije analizirana.");
    if (offer.assessmentReliable === false) reasons.push("Nije moguće pouzdano oceniti.");
    if (!offer.currency) reasons.push("Valuta nije potvrđena.");
    if (offer.landedCostTotal === null) reasons.push("Ukupna nabavna cena nije potvrđena.");
    if (offer.grossMarginPercent === null) reasons.push("Ostvarena marža nije izračunata.");
    if (reasons.length > 0) {
      excluded.push({ offerId: offer.offerId, supplierName: offer.supplierName, reasons: [...new Set(reasons)] });
      return [];
    }
    return [offer];
  });
  const fxStatus = getFxSnapshotStatus(fx, now);
  if (eligible.length === 0) return { groups: [], excluded, fxReliable: fxStatus.reliable };

  const normalized = fxStatus.reliable
    ? eligible.flatMap((offer) => {
      const landedCostTotalEur = convertToEur(offer.landedCostTotal!, offer.currency, fx);
      if (landedCostTotalEur === null) {
        excluded.push({ offerId: offer.offerId, supplierName: offer.supplierName, reasons: ["FX kurs za valutu nije dostupan."] });
        return [];
      }
      return [{ ...offer, landedCostTotalEur }];
    })
    : eligible;

  const groups = new Map<string, ComparableOffer[]>();
  for (const offer of normalized) {
    const currency = offer.currency!;
    groups.set(currency, [...(groups.get(currency) ?? []), offer]);
  }
  return {
    groups: [...groups.entries()].map(([currency, groupOffers]) => buildGroup(currency, groupOffers)),
    excluded,
    fxReliable: fxStatus.reliable,
  };
}
