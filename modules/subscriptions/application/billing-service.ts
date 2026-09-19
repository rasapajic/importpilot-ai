import { randomUUID } from "node:crypto";

import {
  BillingPurchaseStatus,
  BillingSubscriptionStatus,
  Prisma,
  ProjectEntitlementStatus,
  SubscriptionPlan,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import {
  billingEventSchema,
  type BillingEvent,
} from "@/modules/subscriptions/domain/billing-events";
import {
  JAKOV360_FULL_IMPORT_ANALYSIS,
  type Jakov360PlanCode,
} from "@/modules/subscriptions/domain/jakov360-paid-plans";

export class BillingEventApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingEventApplicationError";
  }
}

function jsonPayload(event: BillingEvent): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
}

function subscriptionPlan(plan: "PLUS" | "PRO") {
  return plan === "PLUS" ? SubscriptionPlan.PLUS : SubscriptionPlan.PRO;
}

async function activePlanAfterEnd(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const active = await transaction.billingSubscription.findFirst({
    where: {
      organizationId,
      status: BillingSubscriptionStatus.ACTIVE,
    },
    orderBy: [
      { currentPeriodEnd: "desc" },
      { updatedAt: "desc" },
    ],
    select: { plan: true },
  });

  await transaction.organization.update({
    where: { id: organizationId },
    data: { subscriptionPlan: active?.plan ?? SubscriptionPlan.FREE },
  });
}

async function applySubscriptionActive(
  transaction: Prisma.TransactionClient,
  event: Extract<BillingEvent, { type: "SUBSCRIPTION_ACTIVE" }>,
) {
  const organization = await transaction.organization.findUnique({
    where: { id: event.organizationId },
    select: { id: true },
  });
  if (!organization) throw new BillingEventApplicationError("Organization not found.");

  const existing = await transaction.billingSubscription.findFirst({
    where: {
      provider: event.provider,
      providerSubscriptionId: event.providerSubscriptionId,
    },
    select: { id: true },
  });

  const data = {
    organizationId: event.organizationId,
    provider: event.provider,
    providerCustomerId: event.providerCustomerId ?? null,
    providerSubscriptionId: event.providerSubscriptionId,
    plan: subscriptionPlan(event.plan),
    status: BillingSubscriptionStatus.ACTIVE,
    currentPeriodStart: event.currentPeriodStart ?? null,
    currentPeriodEnd: event.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
  };

  const subscription = existing
    ? await transaction.billingSubscription.update({
        where: { id: existing.id },
        data,
      })
    : await transaction.billingSubscription.create({ data });

  await transaction.billingSubscription.updateMany({
    where: {
      organizationId: event.organizationId,
      id: { not: subscription.id },
      status: BillingSubscriptionStatus.ACTIVE,
    },
    data: { status: BillingSubscriptionStatus.EXPIRED },
  });

  await transaction.organization.update({
    where: { id: event.organizationId },
    data: { subscriptionPlan: subscription.plan },
  });
}

async function applySubscriptionCancelAtPeriodEnd(
  transaction: Prisma.TransactionClient,
  event: Extract<BillingEvent, { type: "SUBSCRIPTION_CANCEL_AT_PERIOD_END" }>,
) {
  const subscription = await transaction.billingSubscription.findFirst({
    where: {
      organizationId: event.organizationId,
      provider: event.provider,
      providerSubscriptionId: event.providerSubscriptionId,
    },
    select: { id: true },
  });
  if (!subscription) {
    throw new BillingEventApplicationError("Billing subscription not found.");
  }

  await transaction.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: true,
      ...(event.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: event.currentPeriodEnd }
        : {}),
    },
  });
}

async function applySubscriptionEnded(
  transaction: Prisma.TransactionClient,
  event: Extract<BillingEvent, { type: "SUBSCRIPTION_ENDED" }>,
) {
  const subscription = await transaction.billingSubscription.findFirst({
    where: {
      organizationId: event.organizationId,
      provider: event.provider,
      providerSubscriptionId: event.providerSubscriptionId,
    },
    select: { id: true },
  });
  if (!subscription) {
    throw new BillingEventApplicationError("Billing subscription not found.");
  }

  await transaction.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: BillingSubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: false,
    },
  });

  await activePlanAfterEnd(transaction, event.organizationId);
}

async function applyFullImportAnalysisPaid(
  transaction: Prisma.TransactionClient,
  event: Extract<BillingEvent, { type: "FULL_IMPORT_ANALYSIS_PAID" }>,
) {
  if (
    event.amountEurCents !== JAKOV360_FULL_IMPORT_ANALYSIS.priceEurCents ||
    event.currency !== "EUR"
  ) {
    throw new BillingEventApplicationError("Full Import Analysis payment amount does not match policy.");
  }

  const project = await transaction.importProject.findFirst({
    where: {
      id: event.projectId,
      organizationId: event.organizationId,
    },
    select: { id: true },
  });
  if (!project) throw new BillingEventApplicationError("Project not found.");

  const existingPurchase = await transaction.billingPurchase.findFirst({
    where: {
      provider: event.provider,
      providerPaymentId: event.providerPaymentId,
    },
    include: { entitlement: true },
  });

  if (existingPurchase) {
    if (
      existingPurchase.organizationId !== event.organizationId ||
      existingPurchase.projectId !== event.projectId ||
      existingPurchase.product !== "FULL_IMPORT_ANALYSIS"
    ) {
      throw new BillingEventApplicationError("Provider payment ID is already linked to another purchase.");
    }
    return;
  }

  const purchase = await transaction.billingPurchase.create({
    data: {
      organizationId: event.organizationId,
      projectId: event.projectId,
      provider: event.provider,
      providerCheckoutId: event.providerCheckoutId ?? null,
      providerPaymentId: event.providerPaymentId,
      product: "FULL_IMPORT_ANALYSIS",
      status: BillingPurchaseStatus.PAID,
      amountEurCents: event.amountEurCents,
      currency: event.currency,
      paidAt: new Date(),
    },
  });

  await transaction.projectEntitlement.create({
    data: {
      organizationId: event.organizationId,
      projectId: event.projectId,
      sourcePurchaseId: purchase.id,
      product: "FULL_IMPORT_ANALYSIS",
      status: ProjectEntitlementStatus.ACTIVE,
      liveSearchesRemaining: JAKOV360_FULL_IMPORT_ANALYSIS.includedLiveSupplierSearches,
      analysesRemaining: JAKOV360_FULL_IMPORT_ANALYSIS.includedFullImportAnalyses,
    },
  });
}

async function applyFullImportAnalysisRefunded(
  transaction: Prisma.TransactionClient,
  event: Extract<BillingEvent, { type: "FULL_IMPORT_ANALYSIS_REFUNDED" }>,
) {
  const purchase = await transaction.billingPurchase.findFirst({
    where: {
      provider: event.provider,
      providerPaymentId: event.providerPaymentId,
    },
    select: { id: true },
  });
  if (!purchase) throw new BillingEventApplicationError("Billing purchase not found.");

  await transaction.billingPurchase.update({
    where: { id: purchase.id },
    data: {
      status: BillingPurchaseStatus.REFUNDED,
      refundedAt: new Date(),
    },
  });

  await transaction.projectEntitlement.updateMany({
    where: { sourcePurchaseId: purchase.id },
    data: {
      status: ProjectEntitlementStatus.REVOKED,
      liveSearchesRemaining: 0,
      analysesRemaining: 0,
    },
  });
}

async function applyParsedBillingEvent(
  transaction: Prisma.TransactionClient,
  event: BillingEvent,
) {
  switch (event.type) {
    case "SUBSCRIPTION_ACTIVE":
      return applySubscriptionActive(transaction, event);
    case "SUBSCRIPTION_CANCEL_AT_PERIOD_END":
      return applySubscriptionCancelAtPeriodEnd(transaction, event);
    case "SUBSCRIPTION_ENDED":
      return applySubscriptionEnded(transaction, event);
    case "FULL_IMPORT_ANALYSIS_PAID":
      return applyFullImportAnalysisPaid(transaction, event);
    case "FULL_IMPORT_ANALYSIS_REFUNDED":
      return applyFullImportAnalysisRefunded(transaction, event);
  }
}

export async function applyBillingEvent(input: unknown) {
  const event = billingEventSchema.parse(input);

  return prisma.$transaction(async (transaction) => {
    const inserted = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "billing_webhook_events" (
        "id",
        "provider",
        "provider_event_id",
        "event_type",
        "payload",
        "created_at"
      )
      VALUES (
        CAST(${randomUUID()} AS UUID),
        ${event.provider},
        ${event.eventId},
        ${event.type},
        CAST(${JSON.stringify(jsonPayload(event))} AS JSONB),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("provider", "provider_event_id") DO NOTHING
      RETURNING "id"
    `);

    if (!inserted[0]) {
      return { applied: false, duplicate: true } as const;
    }

    await applyParsedBillingEvent(transaction, event);

    await transaction.billingWebhookEvent.update({
      where: { id: inserted[0].id },
      data: { processedAt: new Date() },
    });

    return { applied: true, duplicate: false } as const;
  });
}

export async function getBillingAccountSummary(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      subscriptionPlan: true,
      billingSubscriptions: {
        where: { status: BillingSubscriptionStatus.ACTIVE },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          provider: true,
          plan: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
      projectEntitlements: {
        where: {
          product: "FULL_IMPORT_ANALYSIS",
          status: ProjectEntitlementStatus.ACTIVE,
        },
        select: {
          id: true,
          projectId: true,
          liveSearchesRemaining: true,
          analysesRemaining: true,
        },
      },
    },
  });
  if (!organization) throw new BillingEventApplicationError("Organization not found.");

  return {
    plan: organization.subscriptionPlan as Jakov360PlanCode,
    activeSubscription: organization.billingSubscriptions[0] ?? null,
    activeFullImportAnalysisEntitlements: organization.projectEntitlements,
  };
}
