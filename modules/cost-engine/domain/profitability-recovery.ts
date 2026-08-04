import { calculateLandedCost } from "./calculator";

export const ProfitabilityRecoveryActions = {
  TARGET_MET: "TARGET_MET",
  NEGOTIATE_SUPPLIER: "NEGOTIATE_SUPPLIER",
  RAISE_SELLING_PRICE: "RAISE_SELLING_PRICE",
  FIND_NEW_OFFERS: "FIND_NEW_OFFERS",
} as const;

export type ProfitabilityRecoveryAction =
  (typeof ProfitabilityRecoveryActions)[keyof typeof ProfitabilityRecoveryActions];

type DecimalLike = string | number | { toString(): string };

export type ProfitabilityRecoveryInput = {
  targetCountry: string;
  quantity: number;
  currentSupplierUnitPrice: DecimalLike;
  currency: string;
  incoterm: string;
  shippingCost: DecimalLike;
  customsDutyRate: DecimalLike;
  vatRate: DecimalLike;
  storageCost: DecimalLike;
  inspectionCost: DecimalLike;
  customsBrokerCost: DecimalLike;
  otherCosts: DecimalLike;
  targetSellingPrice: DecimalLike;
  currentLandedCostPerUnit: DecimalLike;
  currentGrossMarginPercent: DecimalLike;
  targetMarginPercent: DecimalLike;
};

export type ProfitabilityRecoveryResult = {
  maximumLandedCostPerUnit: string;
  minimumSellingPrice: string;
  maximumSupplierUnitPrice: string | null;
  supplierReductionAmount: string | null;
  supplierReductionPercent: string | null;
  sellingPriceIncreaseAmount: string;
  sellingPriceIncreasePercent: string;
  action: ProfitabilityRecoveryAction;
};

function numeric(value: DecimalLike, label: string) {
  const parsed = Number(value.toString());
  if (!Number.isFinite(parsed)) throw new Error(`${label} nije validan broj.`);
  return parsed;
}

function moneyDown(value: number) {
  return (Math.floor((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function moneyUp(value: number) {
  return (Math.ceil((value - Number.EPSILON) * 100) / 100).toFixed(2);
}

function money(value: number) {
  return value.toFixed(2);
}

function percent(value: number) {
  return value.toFixed(1);
}

function toCalculationString(value: DecimalLike) {
  return value.toString();
}

function calculateWithSupplierPrice(
  input: ProfitabilityRecoveryInput,
  supplierUnitPrice: number,
) {
  return calculateLandedCost({
    targetCountry: input.targetCountry,
    quantity: input.quantity,
    unitPrice: supplierUnitPrice.toFixed(4),
    currency: input.currency,
    incoterm: input.incoterm,
    shippingCost: toCalculationString(input.shippingCost),
    customsDutyRate: toCalculationString(input.customsDutyRate),
    vatRate: toCalculationString(input.vatRate),
    storageCost: toCalculationString(input.storageCost),
    inspectionCost: toCalculationString(input.inspectionCost),
    customsBrokerCost: toCalculationString(input.customsBrokerCost),
    otherCosts: toCalculationString(input.otherCosts),
    targetSellingPrice: toCalculationString(input.targetSellingPrice),
  });
}

function maximumSupplierPrice(
  input: ProfitabilityRecoveryInput,
  currentSupplierUnitPrice: number,
  targetMarginPercent: number,
) {
  const zeroPriceResult = calculateWithSupplierPrice(input, 0);
  if (Number(zeroPriceResult.grossMarginPercent) < targetMarginPercent) return null;

  let low = 0;
  let high = Math.max(0, Math.round(currentSupplierUnitPrice * 10_000));
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = middle / 10_000;
    const result = calculateWithSupplierPrice(input, candidate);
    if (Number(result.grossMarginPercent) >= targetMarginPercent) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best / 10_000;
}

export function calculateProfitabilityRecovery(
  input: ProfitabilityRecoveryInput,
): ProfitabilityRecoveryResult {
  const targetMarginPercent = numeric(input.targetMarginPercent, "Ciljna marža");
  const currentSupplierUnitPrice = numeric(
    input.currentSupplierUnitPrice,
    "Cena dobavljača",
  );
  const sellingPrice = numeric(input.targetSellingPrice, "Prodajna cena");
  const landedCostPerUnit = numeric(
    input.currentLandedCostPerUnit,
    "Stvarna cena po komadu",
  );
  const currentGrossMarginPercent = numeric(
    input.currentGrossMarginPercent,
    "Trenutna marža",
  );

  if (targetMarginPercent < 0 || targetMarginPercent >= 100) {
    throw new Error("Ciljna marža mora biti između 0% i 100%.");
  }
  if (sellingPrice <= 0) throw new Error("Prodajna cena mora biti veća od nule.");
  if (currentSupplierUnitPrice < 0 || landedCostPerUnit < 0) {
    throw new Error("Cene ne mogu biti negativne.");
  }

  const marginFactor = 1 - targetMarginPercent / 100;
  const maximumLandedCostPerUnit = sellingPrice * marginFactor;
  const minimumSellingPrice = landedCostPerUnit / marginFactor;
  const sellingPriceIncreaseAmount = Math.max(0, minimumSellingPrice - sellingPrice);
  const sellingPriceIncreasePercent = sellingPriceIncreaseAmount / sellingPrice * 100;

  if (currentGrossMarginPercent >= targetMarginPercent) {
    return {
      maximumLandedCostPerUnit: moneyDown(maximumLandedCostPerUnit),
      minimumSellingPrice: moneyUp(minimumSellingPrice),
      maximumSupplierUnitPrice: money(currentSupplierUnitPrice),
      supplierReductionAmount: "0.00",
      supplierReductionPercent: "0.0",
      sellingPriceIncreaseAmount: "0.00",
      sellingPriceIncreasePercent: "0.0",
      action: ProfitabilityRecoveryActions.TARGET_MET,
    };
  }

  const maxSupplierUnitPrice = maximumSupplierPrice(
    input,
    currentSupplierUnitPrice,
    targetMarginPercent,
  );
  const supplierReductionAmount = maxSupplierUnitPrice === null
    ? null
    : Math.max(0, currentSupplierUnitPrice - maxSupplierUnitPrice);
  const supplierReductionPercent = supplierReductionAmount === null || currentSupplierUnitPrice === 0
    ? null
    : supplierReductionAmount / currentSupplierUnitPrice * 100;

  let action: ProfitabilityRecoveryAction;
  if (
    supplierReductionPercent !== null &&
    supplierReductionPercent <= 20 &&
    supplierReductionPercent <= sellingPriceIncreasePercent
  ) {
    action = ProfitabilityRecoveryActions.NEGOTIATE_SUPPLIER;
  } else if (sellingPriceIncreasePercent <= 20) {
    action = ProfitabilityRecoveryActions.RAISE_SELLING_PRICE;
  } else {
    action = ProfitabilityRecoveryActions.FIND_NEW_OFFERS;
  }

  return {
    maximumLandedCostPerUnit: moneyDown(maximumLandedCostPerUnit),
    minimumSellingPrice: moneyUp(minimumSellingPrice),
    maximumSupplierUnitPrice: maxSupplierUnitPrice === null
      ? null
      : maxSupplierUnitPrice.toFixed(4),
    supplierReductionAmount: supplierReductionAmount === null
      ? null
      : money(supplierReductionAmount),
    supplierReductionPercent: supplierReductionPercent === null
      ? null
      : percent(supplierReductionPercent),
    sellingPriceIncreaseAmount: money(sellingPriceIncreaseAmount),
    sellingPriceIncreasePercent: percent(sellingPriceIncreasePercent),
    action,
  };
}
