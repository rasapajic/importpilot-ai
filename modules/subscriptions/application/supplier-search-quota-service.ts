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

export type SupplierSearchQuotaReservation = SupplierSearchQuotaStatus & {
  source: "MONTHLY" | "FULL_IMPORT_ANALYSIS";
  entitlementId: string | null;
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
type EntitlementRow = { id: string };

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
}): Promise<SupplierSearchQuotaReservation> {
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
    return {
      ...statusFrom({
        plan,
        used: reserved.used,
        periodStart,
        periodEnd,
      }),
      source: "MONTHLY",
      entitlementId: null,
    };
  }

  const entitlementRows = await prisma.$queryRaw<EntitlementRow[]>(Prisma.sql`
    UPDATE "project_entitlements"
    SET
      "live_searches_remaining" = "live_searches_remaining" - 1,
      "status" = CASE
        WHEN "live_searches_remaining" - 1 = 0 AND "analyses_remaining" = 0
          THEN 'CONSUMED'::"ProjectEntitlementStatus"
        ELSE "status"
      END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "project_entitlements"
      WHERE
        "organization_id" = CAST(${input.organizationId} AS UUID)
        AND "project_id" = CAST(${input.projectId} AS UUID)
        AND "product" = 'FULL_IMPORT_ANALYSIS'::"BillingPurchaseProduct"
        AND "status" = 'ACTIVE'::"ProjectEntitlementStatus"
        AND "live_searches_remaining" > 0
      ORDER BY "created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `);

  const current = await prisma.supplierSearchQuotaUsage.findUnique({
    where: {
      organizationId_periodStart: {
        organizationId: input.organizationId,
        periodStart,
      },
    },
    select: { used: true },
  });

  const monthlyStatus = statusFrom({
    plan,
    used: current?.used ?? limit,
    periodStart,
    periodEnd,
  });

  if (entitlementRows[0]) {
    return {
      ...monthlyStatus,
      source: "FULL_IMPORT_ANALYSIS",
      entitlementId: entitlementRows[0].id,
    };
  }

  throw new SupplierSearchQuotaExceededError(monthlyStatus);
}

export async function releaseSupplierSearchQuotaReservation(input: {
  organizationId: string;
  reservation: SupplierSearchQuotaReservation;
}) {
  if (input.reservation.source === "FULL_IMPORT_ANALYSIS" && input.reservation.entitlementId) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "project_entitlements"
      SET
        "live_searches_remaining" = "live_searches_remaining" + 1,
        "status" = CASE
          WHEN "status" = 'REVOKED'::"ProjectEntitlementStatus"
            THEN "status"
          ELSE 'ACTIVE'::"ProjectEntitlementStatus"
        END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE
        "id" = CAST(${input.reservation.entitlementId} AS UUID)
        AND "organization_id" = CAST(${input.organizationId} AS UUID)
        AND "status" <> 'REVOKED'::"ProjectEntitlementStatus"
    `);
    return;
  }

  await releaseMonthlySupplierSearchQuotaReservation({
    organizationId: input.organizationId,
    periodStart: input.reservation.periodStart,
  });
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

export async function consumeFullImportAnalysisEntitlement(input: {
  organizationId: string;
  projectId: string;
}) {
  const rows = await prisma.$queryRaw<EntitlementRow[]>(Prisma.sql`
    UPDATE "project_entitlements"
    SET
      "analyses_remaining" = "analyses_remaining" - 1,
      "status" = CASE
        WHEN "analyses_remaining" - 1 = 0 AND "live_searches_remaining" = 0
          THEN 'CONSUMED'::"ProjectEntitlementStatus"
        ELSE "status"
      END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "project_entitlements"
      WHERE
        "organization_id" = CAST(${input.organizationId} AS UUID)
        AND "project_id" = CAST(${input.projectId} AS UUID)
        AND "product" = 'FULL_IMPORT_ANALYSIS'::"BillingPurchaseProduct"
        AND "status" = 'ACTIVE'::"ProjectEntitlementStatus"
        AND "analyses_remaining" > 0
      ORDER BY "created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `);

  return rows[0]?.id ?? null;
}
