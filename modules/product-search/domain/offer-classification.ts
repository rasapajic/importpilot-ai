import { isUsableSupplierName } from "../../offers/domain/offer-readiness";

export type OfferKind = "DOMESTIC" | "DIRECT_IMPORT" | "UNKNOWN";

export type QuantityTier = {
  minQuantity: number;
  maxQuantity: number | null;
  price: number | null;
  currency: string | null;
  confirmed: boolean;
};

export type OfferClassificationInput = {
  source?: string | null;
  targetCountry?: string | null;
  supplierCountry?: string | null;
  sellerCountry?: string | null;
  originCountry?: string | null;
  importerName?: string | null;
  currency?: string | null;
  offerType?: OfferKind | null;
  availabilityConfirmed?: boolean | null;
  b2bPriceConfirmed?: boolean | null;
  priceIncludesVat?: boolean | null;
};

export type OfferClassification = {
  kind: OfferKind;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  label: string;
  reason: string;
  directImportCostsForBuyer: boolean | null;
  canUseAsConfirmedB2BPrice: boolean;
  needsSupplierConfirmation: boolean;
};

const domesticSources = [/dudi/i, /\.rs\b/i, /srbija/i, /serbia/i];
const directImportSources = [/alibaba/i, /made-in-china/i, /globalsources/i, /1688/i];

function sameCountry(first?: string | null, second?: string | null) {
  return Boolean(first && second && first.toUpperCase() === second.toUpperCase());
}

export function classifyOffer(input: OfferClassificationInput): OfferClassification {
  if (input.offerType && input.offerType !== "UNKNOWN") {
    const domestic = input.offerType === "DOMESTIC";
    return {
      kind: input.offerType,
      confidence: "HIGH",
      label: domestic ? "Domaća ponuda" : "Direktan uvoz",
      reason: domestic ? "Vrsta ponude je označena kao domaća prodaja." : "Vrsta ponude je označena kao direktan uvoz.",
      directImportCostsForBuyer: domestic ? false : true,
      canUseAsConfirmedB2BPrice: input.b2bPriceConfirmed === true && input.availabilityConfirmed === true,
      needsSupplierConfirmation: input.b2bPriceConfirmed !== true || input.availabilityConfirmed !== true,
    };
  }

  const source = input.source ?? "";
  const domesticBySource = domesticSources.some((pattern) => pattern.test(source));
  const directBySource = directImportSources.some((pattern) => pattern.test(source));
  const domesticByCountry = sameCountry(input.sellerCountry ?? input.supplierCountry, input.targetCountry);
  const hasImporter = Boolean(input.importerName);

  if (domesticBySource || domesticByCountry || hasImporter) {
    return {
      kind: "DOMESTIC",
      confidence: domesticBySource || domesticByCountry ? "MEDIUM" : "LOW",
      label: "Domaća ponuda",
      reason: hasImporter
        ? "Ponuda ima podatak o domaćem uvozniku/prodavcu."
        : "Izvor ili lokacija prodavca ukazuju na domaću ponudu.",
      directImportCostsForBuyer: false,
      canUseAsConfirmedB2BPrice: input.b2bPriceConfirmed === true && input.availabilityConfirmed === true,
      needsSupplierConfirmation: input.b2bPriceConfirmed !== true || input.availabilityConfirmed !== true,
    };
  }

  if (directBySource || (input.supplierCountry && !sameCountry(input.supplierCountry, input.targetCountry))) {
    return {
      kind: "DIRECT_IMPORT",
      confidence: directBySource ? "HIGH" : "MEDIUM",
      label: "Direktan uvoz",
      reason: directBySource ? "Izvor je međunarodna dobavljačka platforma." : "Lokacija dobavljača se razlikuje od ciljne zemlje.",
      directImportCostsForBuyer: true,
      canUseAsConfirmedB2BPrice: input.b2bPriceConfirmed === true && input.availabilityConfirmed === true,
      needsSupplierConfirmation: input.b2bPriceConfirmed !== true || input.availabilityConfirmed !== true,
    };
  }

  return {
    kind: "UNKNOWN",
    confidence: "LOW",
    label: "Vrsta ponude nije potvrđena",
    reason: "Nema dovoljno podataka o prodavcu, lokaciji ili B2B uslovima.",
    directImportCostsForBuyer: null,
    canUseAsConfirmedB2BPrice: false,
    needsSupplierConfirmation: true,
  };
}

export function findMatchingQuantityTier(tiers: QuantityTier[] | null | undefined, quantity: number) {
  return tiers?.find((tier) =>
    quantity >= tier.minQuantity && (tier.maxQuantity === null || quantity <= tier.maxQuantity),
  ) ?? null;
}

export function canShowBestChoice(input: {
  classification: OfferClassification;
  hasComparablePrice: boolean;
  hasConfirmedAvailability: boolean;
}) {
  return (
    input.hasComparablePrice &&
    input.hasConfirmedAvailability &&
    !input.classification.needsSupplierConfirmation &&
    input.classification.kind !== "UNKNOWN"
  );
}

export type BestChoiceCandidate = {
  id: string | number;
  classification: OfferClassification;
  supplierName: string | null;
  price: number | null;
  currency: string | null;
  minimumOrderQuantity: number | null;
  incoterm: string | null;
  availabilityConfirmed?: boolean | null;
  quantityTiers?: QuantityTier[] | null;
};

function comparablePrice(candidate: BestChoiceCandidate, quantity: number) {
  const tier = findMatchingQuantityTier(candidate.quantityTiers, quantity);
  if (tier?.confirmed && tier.price !== null && tier.currency === candidate.currency) return tier.price;
  return candidate.price;
}

export function selectBestChoiceId(
  candidates: BestChoiceCandidate[],
  quantity: number,
): string | number | null {
  const comparable = candidates.filter((candidate) =>
    candidate.classification.kind !== "UNKNOWN" &&
    candidate.classification.needsSupplierConfirmation === false &&
    candidate.classification.canUseAsConfirmedB2BPrice &&
    candidate.availabilityConfirmed === true &&
    isUsableSupplierName(candidate.supplierName) &&
    comparablePrice(candidate, quantity) !== null &&
    Boolean(candidate.currency) &&
    Number.isInteger(candidate.minimumOrderQuantity) &&
    (candidate.minimumOrderQuantity ?? 0) > 0 &&
    Boolean(candidate.incoterm),
  );

  const cohorts = new Map<string, BestChoiceCandidate[]>();
  for (const candidate of comparable) {
    const key = `${candidate.classification.kind}:${candidate.currency}:${candidate.incoterm}`;
    cohorts.set(key, [...(cohorts.get(key) ?? []), candidate]);
  }
  const eligibleCohorts = [...cohorts.values()].filter((cohort) => cohort.length >= 2);
  if (eligibleCohorts.length === 0) return null;
  eligibleCohorts.sort((a, b) => b.length - a.length);
  if (eligibleCohorts[1]?.length === eligibleCohorts[0].length) return null;

  const ranked = eligibleCohorts[0]
    .map((candidate) => ({ candidate, price: comparablePrice(candidate, quantity)! }))
    .sort((a, b) => a.price - b.price);
  if (ranked.length < 2 || ranked[0].price === ranked[1].price) return null;
  return ranked[0].candidate.id;
}
