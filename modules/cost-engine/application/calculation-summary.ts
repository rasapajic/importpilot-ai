type NumericValue = number | string | { toString(): string };

function number(value: NumericValue) {
  return Number(value.toString());
}

export function formatDisplayedPercent(value: NumericValue) {
  return number(value).toFixed(1);
}

export function getDisplayedProfitSummary(input: {
  targetSellingPrice: NumericValue;
  landedCostPerUnit: NumericValue;
  quantity: number;
}) {
  const profitPerUnit = number(input.targetSellingPrice) - number(input.landedCostPerUnit);
  return {
    profitPerUnit: profitPerUnit.toFixed(2),
    totalProfit: (profitPerUnit * input.quantity).toFixed(2),
  };
}
