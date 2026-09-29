export type OfferPriceKind = "CONFIRMED_B2B" | "INDICATIVE" | "RETAIL" | "NONE";

export type OfferPriceClassificationInput = {
  unitPrice?: number | string | { toString(): string } | null;
  currency?: string | null;
  sourceMetadata?: unknown;
};

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasPositivePrice(value: OfferPriceClassificationInput["unitPrice"]) {
  if (value === null || value === undefined) return false;
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function classifyOfferPrice(input: OfferPriceClassificationInput): {
  kind: OfferPriceKind;
  label: string;
  statusLabel: string;
  analysisEligible: boolean;
  rankingEligible: boolean;
} {
  if (!hasPositivePrice(input.unitPrice) || !input.currency) {
    return {
      kind: "NONE",
      label: "Cena nije navedena",
      statusLabel: "Ponuda je odbačena",
      analysisEligible: false,
      rankingEligible: false,
    };
  }

  const metadata = metadataRecord(input.sourceMetadata);
  const isRetail = metadata.retailPriceOnly === true ||
    (metadata.offerType === "DOMESTIC" && metadata.priceIncludesVat === true && metadata.b2bPriceConfirmed !== true);
  if (isRetail) {
    return {
      kind: "RETAIL",
      label: "Maloprodajna cena — samo informativno",
      statusLabel: "Čeka potvrdu B2B cene",
      analysisEligible: false,
      rankingEligible: false,
    };
  }

  if (metadata.b2bPriceConfirmed === true && metadata.availabilityConfirmed === true) {
    return {
      kind: "CONFIRMED_B2B",
      label: "Potvrđena B2B cena",
      statusLabel: "Spremno za analizu",
      analysisEligible: true,
      rankingEligible: true,
    };
  }

  return {
    kind: "INDICATIVE",
    label: "Oglašena/indikativna cena",
    statusLabel: "Čeka potvrdu B2B cene",
    analysisEligible: false,
    rankingEligible: false,
  };
}
