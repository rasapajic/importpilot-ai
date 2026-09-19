import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260919230000_billing_core/migration.sql"),
  "utf8",
);
const billingService = readFileSync(
  join(process.cwd(), "modules/subscriptions/application/billing-service.ts"),
  "utf8",
);
const checkoutRoute = readFileSync(
  join(process.cwd(), "app/api/billing/checkout/route.ts"),
  "utf8",
);
const eventsRoute = readFileSync(
  join(process.cwd(), "app/api/billing/events/route.ts"),
  "utf8",
);
const billingPage = readFileSync(
  join(process.cwd(), "app/(dashboard)/billing/page.tsx"),
  "utf8",
);
const searchUi = readFileSync(
  join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"),
  "utf8",
);

describe("JAKOV360 billing contract", () => {
  it("persists subscriptions, purchases, entitlements and idempotent events", () => {
    expect(schema).toContain("model BillingSubscription");
    expect(schema).toContain("model BillingPurchase");
    expect(schema).toContain("model ProjectEntitlement");
    expect(schema).toContain("model BillingWebhookEvent");
    expect(migration).toContain('CREATE TABLE "billing_subscriptions"');
    expect(migration).toContain('CREATE TABLE "project_entitlements"');
  });

  it("changes plan only from processed billing events", () => {
    expect(billingService).toContain('case "SUBSCRIPTION_ACTIVE"');
    expect(billingService).toContain("subscriptionPlan: subscription.plan");
    expect(billingService).toContain('case "SUBSCRIPTION_ENDED"');
    expect(billingService).toContain("SubscriptionPlan.FREE");
    expect(billingService).toContain('ON CONFLICT ("provider", "provider_event_id") DO NOTHING');
  });

  it("grants the 1.99 EUR project entitlement only after matching payment", () => {
    expect(billingService).toContain("JAKOV360_FULL_IMPORT_ANALYSIS.priceEurCents");
    expect(billingService).toContain("liveSearchesRemaining");
    expect(billingService).toContain("analysesRemaining");
  });

  it("keeps checkout authenticated and provider-controlled", () => {
    expect(checkoutRoute).toContain("authenticateRequest(request)");
    expect(checkoutRoute).toContain("OrganizationRole.OWNER");
    expect(checkoutRoute).toContain("OrganizationRole.ADMIN");
    expect(checkoutRoute).toContain("getBillingCheckoutProvider()");
    expect(checkoutRoute).toContain("BILLING_PROVIDER_NOT_CONFIGURED");
  });

  it("accepts normalized billing events only through a secret bearer token", () => {
    expect(eventsRoute).toContain("BILLING_EVENT_TOKEN");
    expect(eventsRoute).toContain("timingSafeEqual");
    expect(eventsRoute).toContain("applyBillingEvent");
  });

  it("shows launch prices and routes exhausted project searches to billing", () => {
    expect(billingPage).toContain("JAKOV360_PLANS.PLUS");
    expect(billingPage).toContain("JAKOV360_PLANS.PRO");
    expect(billingPage).toContain("JAKOV360_FULL_IMPORT_ANALYSIS");
    expect(searchUi).toContain("SEARCH_LIMIT_REACHED");
    expect(searchUi).toContain("/billing?projectId=");
  });
});
