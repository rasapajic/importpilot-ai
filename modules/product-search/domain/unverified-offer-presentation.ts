import type { ExplicitProductConstraintStatus } from "./explicit-product-constraints";

export type UnverifiedPresentationOffer = {
  id: string;
  overallScore: number | null;
  confidenceScore: number | null;
  finalEligible: boolean;
  suitability: ExplicitProductConstraintStatus;
};

export type UnverifiedPresentationTie = {
  score: number;
  confidence: number;
  suitability: ExplicitProductConstraintStatus;
  ids: string[];
};

/**
 * Groups saved or live offers that still need confirmation and show the same
 * score and confidence. The card number is only display order after that tie.
 * A lower advertised price or a lower listing MOQ is not a separate quality
 * rank until the supplier confirms the product and the quantity price.
 */
export function unverifiedPresentationTies(
  offers: readonly UnverifiedPresentationOffer[],
): UnverifiedPresentationTie[] {
  const groups = new Map<string, UnverifiedPresentationTie>();
  for (const offer of offers) {
    if (offer.finalEligible || offer.suitability !== "NEEDS_CONFIRMATION") continue;
    if (offer.overallScore === null || offer.confidenceScore === null) continue;
    const key = `${offer.suitability}:${offer.overallScore}:${offer.confidenceScore}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(offer.id);
      continue;
    }
    groups.set(key, {
      score: offer.overallScore,
      confidence: offer.confidenceScore,
      suitability: offer.suitability,
      ids: [offer.id],
    });
  }
  return [...groups.values()].filter((group) => group.ids.length >= 2);
}
