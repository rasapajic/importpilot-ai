import { calculationSupersededAt } from "@/modules/negotiation/domain/supplier-confirmation";

export function decisionRemainsCurrent(
  decision: { selectedOfferId: string | null; createdAt: Date | string } | null,
  offers: ReadonlyArray<{
    id: string;
    sourceMetadata?: unknown;
    costCalculations: readonly unknown[];
  }>,
) {
  if (!decision) return false;
  if (!decision.selectedOfferId) return true;
  const offer = offers.find((item) => item.id === decision.selectedOfferId);
  if (!offer || offer.costCalculations.length === 0) return false;
  const supersededAt = calculationSupersededAt(offer.sourceMetadata);
  if (!supersededAt) return true;
  return new Date(decision.createdAt).getTime() > Date.parse(supersededAt);
}
