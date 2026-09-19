export const JAKOV360_PAID_PLANS = {
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

export type Jakov360PaidPlanCode = keyof typeof JAKOV360_PAID_PLANS;

export function getJakov360PaidPlanPolicy(plan: Jakov360PaidPlanCode) {
  return JAKOV360_PAID_PLANS[plan];
}
