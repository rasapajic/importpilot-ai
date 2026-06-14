export type EmptySearchDeletionInput = {
  offerCount: number;
  calculationCount: number;
  documentCount: number;
  hasCompletedRecommendation: boolean;
};

export function canDeleteEmptySearch(input: EmptySearchDeletionInput) {
  return (
    input.offerCount === 0 &&
    input.calculationCount === 0 &&
    input.documentCount === 0 &&
    !input.hasCompletedRecommendation
  );
}
