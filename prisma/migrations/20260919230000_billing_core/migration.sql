CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "BillingPurchaseProduct" AS ENUM ('FULL_IMPORT_ANALYSIS');
CREATE TYPE "BillingPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');
CREATE TYPE "ProjectEntitlementStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED');

CREATE TABLE "billing_subscriptions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "provider_customer_id" VARCHAR(200),
  "provider_subscription_id" VARCHAR(200),
  "plan" "SubscriptionPlan" NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL,
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_subscriptions_paid_plan_check" CHECK ("plan" IN ('PLUS', 'PRO'))
);

CREATE TABLE "billing_purchases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "provider" VARCHAR(40) NOT NULL,
  "provider_checkout_id" VARCHAR(200),
  "provider_payment_id" VARCHAR(200),
  "product" "BillingPurchaseProduct" NOT NULL,
  "status" "BillingPurchaseStatus" NOT NULL,
  "amount_eur_cents" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "paid_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_purchases_amount_positive" CHECK ("amount_eur_cents" > 0)
);

CREATE TABLE "project_entitlements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "source_purchase_id" UUID NOT NULL,
  "product" "BillingPurchaseProduct" NOT NULL,
  "status" "ProjectEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "live_searches_remaining" INTEGER NOT NULL DEFAULT 1,
  "analyses_remaining" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_entitlements_live_searches_nonnegative" CHECK ("live_searches_remaining" >= 0),
  CONSTRAINT "project_entitlements_analyses_nonnegative" CHECK ("analyses_remaining" >= 0)
);

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "provider_event_id" VARCHAR(200) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_id_key"
ON "billing_subscriptions"("provider", "provider_subscription_id");

CREATE INDEX "billing_subscriptions_org_status_period_idx"
ON "billing_subscriptions"("organization_id", "status", "current_period_end");

CREATE UNIQUE INDEX "billing_purchases_provider_payment_id_key"
ON "billing_purchases"("provider", "provider_payment_id");

CREATE INDEX "billing_purchases_org_project_status_idx"
ON "billing_purchases"("organization_id", "project_id", "status", "created_at");

CREATE UNIQUE INDEX "project_entitlements_source_purchase_id_key"
ON "project_entitlements"("source_purchase_id");

CREATE INDEX "project_entitlements_org_project_status_idx"
ON "project_entitlements"("organization_id", "project_id", "status", "created_at");

CREATE UNIQUE INDEX "billing_webhook_events_provider_event_id_key"
ON "billing_webhook_events"("provider", "provider_event_id");

CREATE INDEX "billing_webhook_events_created_at_idx"
ON "billing_webhook_events"("created_at");

ALTER TABLE "billing_subscriptions"
ADD CONSTRAINT "billing_subscriptions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_purchases"
ADD CONSTRAINT "billing_purchases_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_purchases"
ADD CONSTRAINT "billing_purchases_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "import_projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_entitlements"
ADD CONSTRAINT "project_entitlements_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_entitlements"
ADD CONSTRAINT "project_entitlements_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "import_projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_entitlements"
ADD CONSTRAINT "project_entitlements_source_purchase_id_fkey"
FOREIGN KEY ("source_purchase_id") REFERENCES "billing_purchases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
