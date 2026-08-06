CREATE TABLE "ai_usage_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "response_id" VARCHAR(200) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL,
    "reasoning_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL,
    "web_search_calls" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "pricing_version" VARCHAR(80) NOT NULL,
    "input_price_per_million_usd" DECIMAL(20, 12) NOT NULL,
    "cached_input_price_per_million_usd" DECIMAL(20, 12) NOT NULL,
    "output_price_per_million_usd" DECIMAL(20, 12) NOT NULL,
    "web_search_price_per_call_usd" DECIMAL(20, 12) NOT NULL,
    "input_cost_usd" DECIMAL(20, 12) NOT NULL,
    "cached_input_cost_usd" DECIMAL(20, 12) NOT NULL,
    "output_cost_usd" DECIMAL(20, 12) NOT NULL,
    "web_search_cost_usd" DECIMAL(20, 12) NOT NULL,
    "estimated_total_cost_usd" DECIMAL(20, 12) NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_events_provider_response_id_key"
ON "ai_usage_events"("provider", "response_id");

CREATE INDEX "ai_usage_events_organization_id_created_at_idx"
ON "ai_usage_events"("organization_id", "created_at");

CREATE INDEX "ai_usage_events_organization_id_project_id_created_at_idx"
ON "ai_usage_events"("organization_id", "project_id", "created_at");

CREATE INDEX "ai_usage_events_organization_id_operation_model_idx"
ON "ai_usage_events"("organization_id", "operation", "model");

ALTER TABLE "ai_usage_events"
ADD CONSTRAINT "ai_usage_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_events"
ADD CONSTRAINT "ai_usage_events_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "import_projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
