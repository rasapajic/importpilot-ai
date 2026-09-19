import {
  BillingPurchaseStatus,
  OrganizationRole,
  ProjectEntitlementStatus,
  SubscriptionPlan,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("JAKOV360 billing core", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let billing: typeof import("@/modules/subscriptions/application/billing-service");
  let quota: typeof import("@/modules/subscriptions/application/supplier-search-quota-service");
  let organizationId = "";
  let projectId = "";
  let userId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    billing = await import("@/modules/subscriptions/application/billing-service");
    quota = await import("@/modules/subscriptions/application/supplier-search-quota-service");

    const user = await prisma.user.create({
      data: { email: `billing-${crypto.randomUUID()}@example.test`, name: "Billing Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Billing Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Billing Project",
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

  it("applies paid subscriptions idempotently and returns to Free when ended", async () => {
    const eventId = `evt-${crypto.randomUUID()}`;
    const event = {
      type: "SUBSCRIPTION_ACTIVE" as const,
      provider: "test-provider",
      eventId,
      organizationId,
      plan: "PLUS" as const,
      providerSubscriptionId: "sub_test_1",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    };

    expect(await billing.applyBillingEvent(event)).toEqual({ applied: true, duplicate: false });
    expect(await billing.applyBillingEvent(event)).toEqual({ applied: false, duplicate: true });
    expect((await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { subscriptionPlan: true },
    })).subscriptionPlan).toBe(SubscriptionPlan.PLUS);

    await billing.applyBillingEvent({
      type: "SUBSCRIPTION_ENDED",
      provider: "test-provider",
      eventId: `evt-${crypto.randomUUID()}`,
      organizationId,
      providerSubscriptionId: "sub_test_1",
    });

    expect((await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { subscriptionPlan: true },
    })).subscriptionPlan).toBe(SubscriptionPlan.FREE);
  });

  it("grants one-off project credit and uses it after the Free monthly quota", async () => {
    const eventId = `evt-${crypto.randomUUID()}`;
    const paid = {
      type: "FULL_IMPORT_ANALYSIS_PAID" as const,
      provider: "test-provider",
      eventId,
      organizationId,
      projectId,
      providerPaymentId: "payment_test_1",
      amountEurCents: 199,
      currency: "EUR" as const,
    };

    expect(await billing.applyBillingEvent(paid)).toEqual({ applied: true, duplicate: false });
    expect(await billing.applyBillingEvent(paid)).toEqual({ applied: false, duplicate: true });

    const purchase = await prisma.billingPurchase.findFirstOrThrow({
      where: { organizationId, providerPaymentId: "payment_test_1" },
      include: { entitlement: true },
    });
    expect(purchase.status).toBe(BillingPurchaseStatus.PAID);
    expect(purchase.entitlement).toMatchObject({
      status: ProjectEntitlementStatus.ACTIVE,
      liveSearchesRemaining: 1,
      analysesRemaining: 1,
    });

    const now = new Date("2026-12-15T12:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      expect((await quota.reserveMonthlySupplierSearchQuota({
        organizationId, projectId, now,
      })).source).toBe("MONTHLY");
    }

    const oneOff = await quota.reserveMonthlySupplierSearchQuota({
      organizationId, projectId, now,
    });
    expect(oneOff).toMatchObject({
      source: "FULL_IMPORT_ANALYSIS",
      used: 3,
      limit: 3,
      remaining: 0,
    });

    await quota.releaseSupplierSearchQuotaReservation({
      organizationId,
      reservation: oneOff,
    });
    expect(await prisma.projectEntitlement.findUnique({
      where: { id: oneOff.entitlementId! },
      select: { liveSearchesRemaining: true },
    })).toEqual({ liveSearchesRemaining: 1 });
  });
});
