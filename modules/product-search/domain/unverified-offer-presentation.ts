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
 * Groups offers that still need confirmation and show the same score and
 * confidence. Pass the score the card shows. That score may include a
 * provisional advertised-price bonus, so equal shown scores are still one
 * unverified level. Confidence is the unchanged data-confidence value.
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
