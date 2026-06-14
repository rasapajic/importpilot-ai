CREATE TABLE "supplier_search_cache" (
    "id" UUID NOT NULL,
    "query" VARCHAR(200) NOT NULL,
    "normalized_query" VARCHAR(200) NOT NULL,
    "target_country" CHAR(2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "results_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_search_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_search_cache_lookup_key"
ON "supplier_search_cache"("normalized_query", "target_country", "quantity");

CREATE INDEX "supplier_search_cache_lookup_created_at_idx"
ON "supplier_search_cache"("normalized_query", "target_country", "quantity", "created_at");

CREATE INDEX "supplier_search_cache_expires_at_idx"
ON "supplier_search_cache"("expires_at");
