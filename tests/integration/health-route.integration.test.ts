import { describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("deployment health route", () => {
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
});
