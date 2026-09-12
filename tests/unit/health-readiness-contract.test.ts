import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const healthRoute = readFileSync(
  join(process.cwd(), "app/api/health/route.ts"),
  "utf8",
);

describe("production health readiness contract", () => {
  it("bounds the database probe and returns 503 when the mandatory database is unavailable", () => {
    expect(healthRoute).toContain("HEALTH_DATABASE_TIMEOUT_MS = 2_500");
    expect(healthRoute).toContain("prisma.$queryRaw`SELECT 1`");
    expect(healthRoute).toContain("Promise.race");
    expect(healthRoute).toContain('const ready = database === "ok"');
    expect(healthRoute).toContain("{ status: ready ? 200 : 503 }");
  });

  it("does not make the optional supplier-search provider determine core database readiness", () => {
    expect(healthRoute).toContain("getSupplierSearchProviderStatus()");
    expect(healthRoute).toContain("supplierSearchProvider");
    expect(healthRoute).not.toContain('ready = database === "ok" && supplierSearchProvider');
  });
});
