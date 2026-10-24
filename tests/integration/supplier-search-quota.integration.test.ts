import { OrganizationRole, SubscriptionPlan } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("monthly supplier search quota", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let quota: typeof import("@/modules/subscriptions/application/supplier-search-quota-service");
  let organizationId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    quota = await import("@/modules/subscriptions/application/supplier-search-quota-service");

    const user = await prisma.user.create({
      data: {
        email: `quota-${crypto.randomUUID()}@example.test`,
        name: "Quota Owner",
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Quota Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Quota Project",
        targetCountry: "AT",
        quantity: 100,
        targetMargin: 20,
      },
    });

    userId = user.id;
    organizationId = organization.id;
    projectId = project.id;
  });

  afterAll(async () => {
    if (!prisma || !organizationId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("starts new organizations on Free with three searches per calendar month", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { subscriptionPlan: true },
    });
    expect(organization.subscriptionPlan).toBe(SubscriptionPlan.FREE);

    const now = new Date("2026-09-19T20:00:00.000Z");
    const initial = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
    expect(initial).toMatchObject({
      plan: "FREE",
      used: 0,
      limit: 3,
      remaining: 3,
    });

    await quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now });
    await quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now });
    const third = await quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now });
    expect(third).toMatchObject({ used: 3, limit: 3, remaining: 0 });

    await expect(
      quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now }),
    ).rejects.toMatchObject({
      name: "SupplierSearchQuotaExceededError",
      quota: expect.objectContaining({ used: 3, limit: 3, remaining: 0 }),
    });
  });

  it("refunds a technically failed reserved search", async () => {
    const now = new Date("2026-09-19T20:00:00.000Z");
    const period = quota.supplierSearchQuotaPeriod(now);
    await quota.releaseMonthlySupplierSearchQuotaReservation({
      organizationId,
      periodStart: period.periodStart,
    });

    const status = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
    expect(status).toMatchObject({ used: 2, remaining: 1 });

    const reserved = await quota.reserveMonthlySupplierSearchQuota({
      organizationId,
      projectId,
      now,
    });
    expect(reserved).toMatchObject({ used: 3, remaining: 0 });
  });

  it("resets usage in a new month and applies Plus/Pro limits from the same policy", async () => {
    const october = new Date("2026-10-01T00:00:00.000Z");
    const reset = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, october);
    expect(reset).toMatchObject({ plan: "FREE", used: 0, limit: 3, remaining: 3 });

    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionPlan: SubscriptionPlan.PLUS },
    });
    const plus = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, october);
    expect(plus).toMatchObject({ plan: "PLUS", limit: 20, remaining: 20 });

    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionPlan: SubscriptionPlan.PRO },
    });
    const pro = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, october);
    expect(pro).toMatchObject({ plan: "PRO", limit: 50, remaining: 50 });
  });

  it("does not consume quota for a project outside the organization", async () => {
    await expect(
      quota.reserveMonthlySupplierSearchQuota({
        organizationId,
        projectId: crypto.randomUUID(),
        now: new Date("2026-11-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "SupplierSearchQuotaProjectNotFoundError" });

    const status = await quota.getMonthlySupplierSearchQuotaStatus(
      organizationId,
      new Date("2026-11-01T00:00:00.000Z"),
    );
    expect(status.used).toBe(0);
  });

  it("lets only one parallel reservation take the last monthly slot", async () => {
    const now = new Date("2026-12-15T12:00:00.000Z");
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionPlan: SubscriptionPlan.FREE },
    });
    await quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now });
    await quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now });

    const raced = await Promise.allSettled(
      Array.from({ length: 6 }, () => quota.reserveMonthlySupplierSearchQuota({
        organizationId,
        projectId,
        now,
      })),
    );

    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(5);
    const status = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
    expect(status).toMatchObject({ plan: "FREE", used: 3, limit: 3, remaining: 0 });
  });

  it("returns a released slot after the monthly quota was exhausted", async () => {
    const now = new Date("2026-12-15T12:00:00.000Z");
    const exhausted = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
    expect(exhausted.remaining).toBe(0);

    await quota.releaseMonthlySupplierSearchQuotaReservation({
      organizationId,
      periodStart: quota.supplierSearchQuotaPeriod(now).periodStart,
    });

    const restored = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
    expect(restored).toMatchObject({ used: 2, remaining: 1 });

    const reserved = await quota.reserveMonthlySupplierSearchQuota({
      organizationId,
      projectId,
      now,
    });
    expect(reserved).toMatchObject({ used: 3, remaining: 0, source: "MONTHLY" });
    await expect(
      quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now }),
    ).rejects.toMatchObject({ name: "SupplierSearchQuotaExceededError" });
  });

  it("enforces the acceptance-staging allowance atomically for the designated Free test org", async () => {
    const names = [
      "RENDER_SERVICE_ID",
      "JAKOV360_ACCEPTANCE_TEST_ORG_ID",
      "JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT",
    ] as const;
    const previous = names.map((name) => process.env[name]);

    process.env.RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
    process.env.JAKOV360_ACCEPTANCE_TEST_ORG_ID = organizationId;
    process.env.JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT = "100";

    try {
      const now = new Date("2027-01-10T12:00:00.000Z");
      const initial = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
      expect(initial).toMatchObject({ plan: "FREE", used: 0, limit: 100, remaining: 100 });

      const reservations = await Promise.all(
        Array.from({ length: 4 }, () =>
          quota.reserveMonthlySupplierSearchQuota({ organizationId, projectId, now }),
        ),
      );
      expect(reservations).toHaveLength(4);
      expect(reservations.every((item) => item.limit === 100 && item.source === "MONTHLY")).toBe(true);

      const after = await quota.getMonthlySupplierSearchQuotaStatus(organizationId, now);
      expect(after).toMatchObject({ plan: "FREE", used: 4, limit: 100, remaining: 96 });
    } finally {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });
});
