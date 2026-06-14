import { OrganizationRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("auth integration", () => {
  const context = { ipAddress: "127.0.0.1", userAgent: "Vitest" };
  const password = "Integration-Test-2026";
  const email = `owner-${crypto.randomUUID()}@example.test`;
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let authService: typeof import("@/modules/auth/application/auth-service");
  let sessionService: typeof import("@/modules/auth/infrastructure/session");
  let metricsService: typeof import("@/modules/auth/application/auth-metrics");
  let dashboardRoute: typeof import("@/app/api/dashboard/route");
  let ownerToken: string;
  let userId: string;
  let organizationId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    authService = await import("@/modules/auth/application/auth-service");
    sessionService = await import("@/modules/auth/infrastructure/session");
    metricsService = await import("@/modules/auth/application/auth-metrics");
    dashboardRoute = await import("@/app/api/dashboard/route");

    ownerToken = await authService.register(
      { name: "Integration Owner", organizationName: "Integration Org", email, password },
      context,
    );
    const auth = await sessionService.validateSessionToken(ownerToken);
    userId = auth!.user.id;
    organizationId = auth!.membership.organizationId;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("registers an owner, organization and session", async () => {
    const auth = await sessionService.validateSessionToken(ownerToken);
    expect(auth?.membership.role).toBe(OrganizationRole.OWNER);
    expect(auth?.membership.organization.name).toBe("Integration Org");
  });

  it("logs in and preserves concurrent sessions", async () => {
    const secondToken = await authService.login({ email, password }, context);
    expect(secondToken).not.toBe(ownerToken);
    expect(await sessionService.validateSessionToken(ownerToken)).not.toBeNull();
    expect(await sessionService.validateSessionToken(secondToken)).not.toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
  });

  it("logs out only the selected session", async () => {
    const token = await authService.login({ email, password }, context);
    await authService.logout(token, context);
    expect(await sessionService.validateSessionToken(token)).toBeNull();
    expect(await sessionService.validateSessionToken(ownerToken)).not.toBeNull();
  });

  it("rejects an expired session and removes it", async () => {
    const token = await authService.login({ email, password }, context);
    const tokenHash = sessionService.hashSessionToken(token);
    await prisma.session.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await sessionService.validateSessionToken(token)).toBeNull();
    expect(await prisma.session.findUnique({ where: { tokenHash } })).toBeNull();
  });

  it("rotates an old cookie token without creating another session", async () => {
    const token = await authService.login({ email, password }, context);
    const tokenHash = sessionService.hashSessionToken(token);
    await prisma.session.update({
      where: { tokenHash },
      data: { lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });
    const countBefore = await prisma.session.count({ where: { userId } });
    const rotation = await sessionService.rotateSessionToken(token);

    expect(rotation).not.toBeNull();
    expect(await sessionService.validateSessionToken(token)).toBeNull();
    expect(await sessionService.validateSessionToken(rotation!.token)).not.toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(countBefore);
  });

  it("protects dashboard data from invalid sessions", async () => {
    const denied = await dashboardRoute.GET(
      new NextRequest("http://localhost/api/dashboard"),
    );
    const allowed = await dashboardRoute.GET(
      new NextRequest("http://localhost/api/dashboard", {
        headers: { cookie: `tradepilot_session=${ownerToken}` },
      }),
    );

    expect(denied.status).toBe(401);
    expect(allowed.status).toBe(200);
  });

  it("allows owner and admin metrics access and denies member access", async () => {
    await expect(metricsService.getAuthMetrics(ownerToken)).resolves.toMatchObject({
      active: expect.any(Number),
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin-${crypto.randomUUID()}@example.test`,
        name: "Integration Admin",
        memberships: {
          create: { organizationId, role: OrganizationRole.ADMIN },
        },
      },
    });
    const adminSession = sessionService.createSessionData(admin.id, organizationId, context);
    await prisma.session.create({ data: adminSession.data });
    await expect(metricsService.getAuthMetrics(adminSession.token)).resolves.toMatchObject({
      active: expect.any(Number),
    });

    const member = await prisma.user.create({
      data: {
        email: `member-${crypto.randomUUID()}@example.test`,
        name: "Integration Member",
        memberships: {
          create: { organizationId, role: OrganizationRole.MEMBER },
        },
      },
    });
    const memberSession = sessionService.createSessionData(member.id, organizationId, context);
    await prisma.session.create({ data: memberSession.data });

    await expect(metricsService.getAuthMetrics(memberSession.token)).rejects.toBeInstanceOf(
      metricsService.MetricsAccessDeniedError,
    );
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: member.id } });
  });
});
