import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260919220000_supplier_search_quota/migration.sql"),
  "utf8",
);
const route = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/supplier-search/route.ts"),
  "utf8",
);
const service = readFileSync(
  join(process.cwd(), "modules/subscriptions/application/supplier-search-quota-service.ts"),
  "utf8",
);
const productSearch = readFileSync(
  join(process.cwd(), "modules/product-search/application/product-search-service.ts"),
  "utf8",
);

describe("JAKOV360 supplier-search quota contract", () => {
  it("stores plan and monthly usage in PostgreSQL", () => {
    expect(schema).toContain("enum SubscriptionPlan");
    expect(schema).toContain("subscriptionPlan SubscriptionPlan @default(FREE)");
    expect(schema).toContain("model SupplierSearchQuotaUsage");
    expect(migration).toContain("UPDATE \"organizations\"");
    expect(migration).toContain("SET \"subscription_plan\" = 'PRO'");
  });

  it("reserves quota atomically before live provider work", () => {
    expect(service).toContain('ON CONFLICT ("organization_id", "period_start")');
    expect(service).toContain('"used" = "supplier_search_quota_usage"."used" + 1');
    expect(service).toContain('WHERE "supplier_search_quota_usage"."used" <');
    expect(route).toContain("reserveMonthlySupplierSearchQuota");
    expect(route.indexOf("reserveMonthlySupplierSearchQuota"))
      .toBeLessThan(route.indexOf("searchProjectSupplierOffers("));
  });

  it("refunds quota when a technical live-search request fails", () => {
    expect(route).toContain("releaseSupplierSearchQuotaReservation");
    expect(service).toContain('GREATEST("used" - 1, 0)');
  });

  it("uses a paid Full Import Analysis entitlement only after monthly quota is exhausted", () => {
    expect(service).toContain('"product" = \'FULL_IMPORT_ANALYSIS\'::"BillingPurchaseProduct"');
    expect(service).toContain('"live_searches_remaining" = "live_searches_remaining" - 1');
    expect(service).toContain('source: "FULL_IMPORT_ANALYSIS"');
  });

  it("returns a structured 429 when no monthly or project entitlement remains", () => {
    expect(route).toContain('code: "SEARCH_LIMIT_REACHED"');
    expect(route).toContain("{ status: 429 }");
    expect(route).toContain("serializedQuota(error.quota)");
  });

  it("keeps cached project restoration outside quota enforcement", () => {
    const cachedStart = productSearch.indexOf("export async function loadCachedProjectSupplierOffers");
    expect(cachedStart).toBeGreaterThanOrEqual(0);
    const cachedSource = productSearch.slice(cachedStart);
    expect(cachedSource).not.toContain("reserveMonthlySupplierSearchQuota");
    expect(cachedSource).toContain('resultOrigin: "cache"');
  });
});
