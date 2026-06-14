export const SupplierRiskLevels = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  UNKNOWN: "UNKNOWN",
} as const;

export type SupplierRiskLevel = (typeof SupplierRiskLevels)[keyof typeof SupplierRiskLevels];

export type SupplierRiskInput = {
  verifiedSupplier: boolean | null;
  yearsOnPlatform: number | null;
  responseRatePercent: number | null;
  transactionCount: number | null;
  employeeCount: number | null;
  profileCompletenessScore: number | null;
  sampleAvailable: boolean | null;
  clearCommercialTermsScore: number | null;
  clearTransportScore: number | null;
};

type Rule = {
  key: string;
  known: boolean;
  delta: number;
  reason: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function level(score: number, knownCount: number): SupplierRiskLevel {
  if (knownCount <= 3) return SupplierRiskLevels.UNKNOWN;
  if (score <= 35) return SupplierRiskLevels.LOW;
  if (score <= 65) return SupplierRiskLevels.MEDIUM;
  return SupplierRiskLevels.HIGH;
}

export function assessSupplierRiskV2(input: SupplierRiskInput) {
  const rules: Rule[] = [
    {
      key: "verifiedSupplier",
      known: input.verifiedSupplier !== null,
      delta: input.verifiedSupplier === true ? -15 : input.verifiedSupplier === false ? 15 : 0,
      reason: input.verifiedSupplier === true
        ? "Dobavljač je verifikovan."
        : input.verifiedSupplier === false
          ? "Dobavljač nije verifikovan."
          : "Verifikacija dobavljača nije poznata.",
    },
    {
      key: "yearsOnPlatform",
      known: input.yearsOnPlatform !== null,
      delta: input.yearsOnPlatform === null ? 0 : input.yearsOnPlatform >= 3 ? -10 : input.yearsOnPlatform < 1 ? 10 : 0,
      reason: input.yearsOnPlatform === null ? "Godine na platformi nisu poznate." : `${input.yearsOnPlatform} godina na platformi.`,
    },
    {
      key: "responseRate",
      known: input.responseRatePercent !== null,
      delta: input.responseRatePercent === null ? 0 : input.responseRatePercent >= 80 ? -10 : input.responseRatePercent < 50 ? 10 : 0,
      reason: input.responseRatePercent === null ? "Stopa odgovora nije poznata." : `Stopa odgovora je ${input.responseRatePercent}%.`,
    },
    {
      key: "transactionCount",
      known: input.transactionCount !== null,
      delta: input.transactionCount === null ? 0 : input.transactionCount >= 50 ? -10 : input.transactionCount === 0 ? 10 : 0,
      reason: input.transactionCount === null ? "Broj transakcija nije poznat." : `${input.transactionCount} zabeleženih transakcija.`,
    },
    {
      key: "profileCompleteness",
      known: input.profileCompletenessScore !== null,
      delta: input.profileCompletenessScore === null ? 0 : input.profileCompletenessScore >= 70 ? -10 : input.profileCompletenessScore < 40 ? 10 : 0,
      reason: input.profileCompletenessScore === null ? "Kvalitet profila nije poznat." : `Kvalitet profila je ${input.profileCompletenessScore}/100.`,
    },
    {
      key: "sampleAvailable",
      known: input.sampleAvailable !== null,
      delta: input.sampleAvailable === true ? -5 : input.sampleAvailable === false ? 5 : 0,
      reason: input.sampleAvailable === true ? "Uzorak je dostupan." : input.sampleAvailable === false ? "Uzorak nije dostupan." : "Dostupnost uzorka nije poznata.",
    },
    {
      key: "clearCommercialTerms",
      known: input.clearCommercialTermsScore !== null,
      delta: input.clearCommercialTermsScore === null ? 0 : input.clearCommercialTermsScore >= 70 ? -5 : input.clearCommercialTermsScore < 40 ? 5 : 0,
      reason: input.clearCommercialTermsScore === null ? "Jasnoća komercijalnih uslova nije poznata." : `Jasnoća komercijalnih uslova je ${input.clearCommercialTermsScore}/100.`,
    },
    {
      key: "clearTransport",
      known: input.clearTransportScore !== null,
      delta: input.clearTransportScore === null ? 0 : input.clearTransportScore >= 70 ? -5 : input.clearTransportScore < 40 ? 5 : 0,
      reason: input.clearTransportScore === null ? "Jasnoća transporta nije poznata." : `Jasnoća transporta je ${input.clearTransportScore}/100.`,
    },
  ];
  const knownRules = rules.filter((rule) => rule.known);
  const riskScore = clamp(50 + rules.reduce((sum, rule) => sum + rule.delta, 0));
  const riskLevel = level(riskScore, knownRules.length);
  const reasons = [
    ...(riskLevel === SupplierRiskLevels.UNKNOWN ? ["Nema dovoljno podataka o dobavljaču."] : []),
    ...rules
      .filter((rule) => rule.known && rule.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .map((rule) => rule.reason),
  ];

  return {
    riskScore,
    riskLevel,
    reasons: reasons.length > 0 ? reasons : ["Podaci o dobavljaču ne ukazuju na izražen rizik."],
    components: rules,
    knownCount: knownRules.length,
  };
}
