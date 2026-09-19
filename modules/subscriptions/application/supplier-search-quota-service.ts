import { Prisma, type SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import {
  getJakov360PlanPolicy,
  type Jakov360PlanCode,
} from "@/modules/subscriptions/domain/jakov360-paid-plans";

export type SupplierSearchQuotaStatus = {
  plan: Jakov360PlanCode;
  used: number;
  limit: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
};

export class SupplierSearchQuotaExceededError extends Error {
  constructor(public readonly quota: SupplierSearchQuotaStatus) {
    super("Monthly supplier search limit reached.");
    this.name = "SupplierSearchQuotaExceededError";
  }
}

export class SupplierSearchQuotaProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "SupplierSearchQuotaProjectNotFoundError";
  }
}

type UsageRow = { used: number };

function planCode(plan: SubscriptionPlan): Jakov360PlanCode {
  switch (plan) {
    case "FREE":
    case "PLUS":
    case "PRO":
      return plan;
  }
}

export function supplierSearchQuotaPeriod(now: Date = new Date()) {
  const periodStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
  ));
  const periodEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
  ));
  return { periodStart, periodEnd };
}

async function organizationPlan(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionPlan: true },
  });
  if (!organization) throw new SupplierSearchQuotaProjectNotFoundError();
  return planCode(organization.subscriptionPlan);
}

function statusFrom(input: {
  plan: Jakov360PlanCode;
  used: number;
  periodStart: Date;
  periodEnd: Date;
}): SupplierSearchQuotaStatus {
  const limit = getJakov360PlanPolicy(input.plan).monthlySupplierSearchLimit;
  return {
    plan: input.plan,
    used: input.used,
    limit,
    remaining: Math.max(0, limit - input.used),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  };
}

export async function getMonthlySupplierSearchQuotaStatus(
  organizationId: string,
  now: Date = new Date(),
): Promise<SupplierSearchQuotaStatus> {
  const plan = await organizationPlan(organizationId);
  const { periodStart, periodEnd } = supplierSearchQuotaPeriod(now);
  const usage = await prisma.supplierSearchQuotaUsage.findUnique({
    where: {
      organizationId_periodStart: { organizationId, periodStart },
    },
    select: { used: true },
  });
  return statusFrom({
    plan,
    used: usage?.used ?? 0,
    periodStart,
    periodEnd,
  });
}

export async function reserveMonthlySupplierSearchQuota(input: {
  organizationId: string;
  projectId: string;
  now?: Date;
}): Promise<SupplierSearchQuotaStatus> {
  const project = await prisma.importProject.findFirst({
    where: {
      id: input.projectId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });
  if (!project) throw new SupplierSearchQuotaProjectNotFoundError();

  const plan = await organizationPlan(input.organizationId);
  const limit = getJakov360PlanPolicy(plan).monthlySupplierSearchLimit;
  const { periodStart, periodEnd } = supplierSearchQuotaPeriod(input.now);

  const rows = await prisma.$queryRaw<UsageRow[]>(Prisma.sql`
    INSERT INTO "supplier_search_quota_usage" (
      "organization_id",
      "period_start",
      "used",
      "created_at",
      "updated_at"
    )
    VALUES (
      CAST(${input.organizationId} AS UUID),
      ${periodStart}::date,
      1,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("organization_id", "period_start")
    DO UPDATE SET
      "used" = "supplier_search_quota_usage"."used" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "supplier_search_quota_usage"."used" < ${limit}
    RETURNING "used"
  `);

  const reserved = rows[0];
  if (reserved) {
    return statusFrom({
      plan,
      used: reserved.used,
      periodStart,
      periodEnd,
    });
  }

  const current = await prisma.supplierSearchQuotaUsage.findUnique({
    where: {
      organizationId_periodStart: {
        organizationId: input.organizationId,
        periodStart,
      },
    },
    select: { used: true },
  });

  throw new SupplierSearchQuotaExceededError(statusFrom({
    plan,
    used: current?.used ?? limit,
    periodStart,
    periodEnd,
  }));
}

export async function releaseMonthlySupplierSearchQuotaReservation(input: {
  organizationId: string;
  periodStart: Date;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "supplier_search_quota_usage"
    SET
      "used" = GREATEST("used" - 1, 0),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE
      "organization_id" = CAST(${input.organizationId} AS UUID)
      AND "period_start" = ${input.periodStart}::date
      AND "used" > 0
  `);
}
