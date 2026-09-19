-- JAKOV360 subscription plan + monthly live supplier-search quota.
-- Existing pre-launch organizations are promoted to PRO so current internal
-- test accounts remain usable while new organizations start on FREE.

CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PLUS', 'PRO');

ALTER TABLE "organizations"
ADD COLUMN "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';

UPDATE "organizations"
SET "subscription_plan" = 'PRO';

CREATE TABLE "supplier_search_quota_usage" (
    "organization_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_search_quota_usage_pkey"
      PRIMARY KEY ("organization_id", "period_start"),
    CONSTRAINT "supplier_search_quota_usage_used_nonnegative"
      CHECK ("used" >= 0)
);

CREATE INDEX "supplier_search_quota_usage_period_start_idx"
ON "supplier_search_quota_usage"("period_start");

ALTER TABLE "supplier_search_quota_usage"
ADD CONSTRAINT "supplier_search_quota_usage_organization_id_fkey"
FOREIGN KEY ("organization_id")
REFERENCES "organizations"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
