export type LandedCostInput = {
  targetCountry: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  incoterm: string;
  shippingCost: string;
  customsDutyRate: string;
  vatRate: string;
  storageCost: string;
  inspectionCost: string;
  otherCosts: string;
  targetSellingPrice: string;
};

export type LandedCostResult = LandedCostInput & {
  customsDutyAmount: string;
  vatAmount: string;
  landedCostTotal: string;
  landedCostPerUnit: string;
  grossMarginPercent: string;
  breakEvenPrice: string;
};

const decimalPattern = /^(0|[1-9]\d*)(\.\d+)?$/;
const MAX_DECIMAL_18_SCALED = 999_999_999_999_999_999n;
const MAX_MARGIN_SCALED_4 = 99_999_999n;

function parseDecimal(value: string, scale: number, label: string) {
  if (!decimalPattern.test(value)) throw new Error(`${label} mora biti nenegativan decimalni broj.`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new Error(`${label} ima previše decimalnih mesta.`);
  const parsed =
    BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
  if (parsed > MAX_DECIMAL_18_SCALED) throw new Error(`${label} je izvan dozvoljenog opsega.`);
  return parsed;
}

function divideHalfUp(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new Error("Delilac mora biti pozitivan.");
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return -((-numerator + denominator / 2n) / denominator);
}

function formatDecimal(value: bigint, scale: number) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const factor = 10n ** BigInt(scale);
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function calculateLandedCost(input: LandedCostInput): LandedCostResult {
  if (!/^[A-Z]{2}$/.test(input.targetCountry)) throw new Error("Ciljna zemlja nije validna.");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Valuta nije validna.");
  if (!input.incoterm.trim() || input.incoterm.length > 20) throw new Error("Incoterm nije validan.");
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity <= 0 ||
    input.quantity > 2_147_483_647
  ) {
    throw new Error("Količina mora biti pozitivan ceo broj.");
  }

  const unitPriceScale4 = parseDecimal(input.unitPrice, 4, "Cena po jedinici");
  const shipping = parseDecimal(input.shippingCost, 2, "Transport");
  const storage = parseDecimal(input.storageCost, 2, "Skladištenje");
  const inspection = parseDecimal(input.inspectionCost, 2, "Inspekcija");
  const other = parseDecimal(input.otherCosts, 2, "Ostali troškovi");
  const sellingPrice = parseDecimal(input.targetSellingPrice, 2, "Ciljna prodajna cena");
  const customsRate = parseDecimal(input.customsDutyRate, 4, "Carinska stopa");
  const vatRate = parseDecimal(input.vatRate, 4, "PDV stopa");

  if (sellingPrice <= 0n) throw new Error("Ciljna prodajna cena mora biti veća od nule.");
  if (customsRate > 500n * 10_000n) throw new Error("Carinska stopa ne sme biti veća od 500%.");
  if (vatRate > 100n * 10_000n) throw new Error("PDV stopa ne sme biti veća od 100%.");

  const goodsCost = divideHalfUp(unitPriceScale4 * BigInt(input.quantity), 100n);
  const customsBase = goodsCost + shipping;
  const rateDenominator = 100n * 10_000n;
  const customsDutyAmount = divideHalfUp(customsBase * customsRate, rateDenominator);
  const vatBase = customsBase + customsDutyAmount + inspection + other;
  const vatAmount = divideHalfUp(vatBase * vatRate, rateDenominator);
  const landedCostTotal =
    goodsCost + shipping + customsDutyAmount + vatAmount + storage + inspection + other;
  const landedCostPerUnit = divideHalfUp(landedCostTotal, BigInt(input.quantity));
  const grossMarginScaled4 = divideHalfUp(
    (sellingPrice - landedCostPerUnit) * 100n * 10_000n,
    sellingPrice,
  );
  const monetaryResults = [
    goodsCost,
    customsDutyAmount,
    vatAmount,
    landedCostTotal,
    landedCostPerUnit,
  ];
  if (monetaryResults.some((value) => value > MAX_DECIMAL_18_SCALED)) {
    throw new Error("Rezultat je izvan dozvoljenog novčanog opsega.");
  }
  if (
    grossMarginScaled4 > MAX_MARGIN_SCALED_4 ||
    grossMarginScaled4 < -MAX_MARGIN_SCALED_4
  ) {
    throw new Error("Bruto marža je izvan dozvoljenog opsega.");
  }

  return {
    ...input,
    customsDutyAmount: formatDecimal(customsDutyAmount, 2),
    vatAmount: formatDecimal(vatAmount, 2),
    landedCostTotal: formatDecimal(landedCostTotal, 2),
    landedCostPerUnit: formatDecimal(landedCostPerUnit, 2),
    grossMarginPercent: formatDecimal(grossMarginScaled4, 4),
    breakEvenPrice: formatDecimal(landedCostPerUnit, 2),
  };
}
