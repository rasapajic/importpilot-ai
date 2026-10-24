import {
  getJakov360PlanPolicy,
  type Jakov360PlanCode,
} from "./jakov360-paid-plans";

// A bounded test allowance, never an alternative public subscription plan.
const ACCEPTANCE_RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
const MAX_ACCEPTANCE_MONTHLY_LIMIT = 500;

type QuotaEnvironment = {
  RENDER_SERVICE_ID?: string;
  JAKOV360_ACCEPTANCE_TEST_ORG_ID?: string;
  JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT?: string;
};

export function effectiveMonthlySupplierSearchLimit(
  input: { plan: Jakov360PlanCode; organizationId: string },
  env: QuotaEnvironment = process.env,
): number {
  const standardLimit = getJakov360PlanPolicy(input.plan).monthlySupplierSearchLimit;

  // This override is only for the designated Free test organization on the
  // specific acceptance-staging Render service. All other users and services
  // retain the commercial plan policy even if the variable is misconfigured.
  if (
    input.plan !== "FREE" ||
    env.RENDER_SERVICE_ID !== ACCEPTANCE_RENDER_SERVICE_ID ||
    !env.JAKOV360_ACCEPTANCE_TEST_ORG_ID ||
    env.JAKOV360_ACCEPTANCE_TEST_ORG_ID !== input.organizationId
  ) {
    return standardLimit;
  }

  const rawLimit = env.JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT;
  if (!rawLimit || !/^\d+$/.test(rawLimit)) return standardLimit;

  const requestedLimit = Number(rawLimit);
  if (
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit <= standardLimit ||
    requestedLimit > MAX_ACCEPTANCE_MONTHLY_LIMIT
  ) {
    return standardLimit;
  }

  return requestedLimit;
}
