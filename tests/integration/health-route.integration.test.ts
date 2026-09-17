import { afterEach, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("deployment health route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports healthy only when the database is reachable", async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      service: "tradepilot-ai",
      status: "ok",
      database: "ok",
    });
  });

  it("fails closed with 503 when the database readiness query fails", async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    const { prisma } = await import("@/lib/database/prisma");
    const querySpy = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("database unavailable"));
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    const body = await response.json();

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
    expect(body).toEqual({
      service: "tradepilot-ai",
      status: "unavailable",
      database: "error",
    });
  });
});
