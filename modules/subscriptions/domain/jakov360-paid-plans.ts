export const JAKOV360_PLANS = {
  FREE: {
    code: "FREE",
    monthlyPriceEurCents: 0,
    monthlySupplierSearchLimit: 3,
  },
  PLUS: {
    code: "PLUS",
    monthlyPriceEurCents: 999,
    monthlySupplierSearchLimit: 20,
  },
  PRO: {
    code: "PRO",
    monthlyPriceEurCents: 1999,
    monthlySupplierSearchLimit: 50,
  },
} as const;

export const JAKOV360_PAID_PLANS = {
  PLUS: JAKOV360_PLANS.PLUS,
  PRO: JAKOV360_PLANS.PRO,
} as const;

export const JAKOV360_FULL_IMPORT_ANALYSIS = {
  priceEurCents: 199,
  includedLiveSupplierSearches: 1,
  includedFullImportAnalyses: 1,
} as const;

export const JAKOV360_SEARCH_LIMIT_EXHAUSTED_POLICY = {
  allowExistingProjects: true,
  allowSavedResults: true,
  allowLiveSupplierSearch: false,
  allowOneOffFullImportAnalysisPurchase: true,
  upgradePlans: ["PLUS", "PRO"],
} as const;

export type Jakov360PlanCode = keyof typeof JAKOV360_PLANS;
export type Jakov360PaidPlanCode = keyof typeof JAKOV360_PAID_PLANS;

export function getJakov360PlanPolicy(plan: Jakov360PlanCode) {
  return JAKOV360_PLANS[plan];
}

export function getJakov360PaidPlanPolicy(plan: Jakov360PaidPlanCode) {
  return JAKOV360_PAID_PLANS[plan];
}
