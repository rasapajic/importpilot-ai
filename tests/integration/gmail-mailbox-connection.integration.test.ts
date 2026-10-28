import { randomBytes, randomUUID } from "node:crypto";
import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Gmail connection storage and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/negotiation/application/gmail-mailbox-connection-service");
  let cryptoModule: typeof import("@/modules/negotiation/infrastructure/gmail-credential-crypto");
  let userId: string;
  let primaryOrgId: string;
  let otherOrgId: string;
  let connectionId: string;
  const originalDatabase = process.env.DATABASE_URL;
  const originalKey = process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = randomBytes(32).toString("base64url");
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/negotiation/application/gmail-mailbox-connection-service");
    cryptoModule = await import("@/modules/negotiation/infrastructure/gmail-credential-crypto");
    const user = await prisma.user.create({
      data: {
        email: `gmail-m1b-${randomUUID()}@example.test`,
        name: "Gmail Connection Tester",
      },
    });
    userId = user.id;
    const first = await prisma.organization.create({
      data: {
        name: "Gmail Test Primary",
        members: { create: { userId, role: OrganizationRole.OWNER } },
      },
    });
    primaryOrgId = first.id;
    const second = await prisma.organization.create({
      data: {
        name: "Gmail Test Foreign Org",
        members: { create: { userId, role: OrganizationRole.ADMIN } },
      },
    });
    otherOrgId = second.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (primaryOrgId) await prisma.organization.delete({ where: { id: primaryOrgId } });
      if (otherOrgId) await prisma.organization.delete({ where: { id: otherOrgId } });
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    }
    if (originalDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabase;
    if (originalKey === undefined) delete process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64;
    else process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = originalKey;
  });

  it("stores only encrypted credentials and lists connections only in their organization", async () => {
    const linked = await service.connectGmailMailbox({
      organizationId: primaryOrgId,
      connectedByUserId: userId,
      mailbox: {
        providerAccountId: "google-account-test-123",
        email: "supplier-buyer@example.test",
        refreshToken: "test-refresh-credential-must-not-be-stored-in-plaintext",
        grantedScopes: "openid email https://www.googleapis.com/auth/gmail.send",
      },
    });
    connectionId = linked.id;
    expect(await service.listGmailMailboxConnections(primaryOrgId)).toHaveLength(1);
    expect(await service.listGmailMailboxConnections(otherOrgId)).toEqual([]);

    const stored = await prisma.mailboxConnection.findFirstOrThrow({
      where: { id: connectionId, organizationId: primaryOrgId },
    });
    expect(stored.encryptedRefreshToken).toMatch(/^g1\./);
    expect(stored.encryptedRefreshToken).not.toContain("test-refresh-credential");
    expect(cryptoModule.decryptGmailRefreshToken(
      stored.encryptedRefreshToken, primaryOrgId, stored.providerAccountId,
    )).toBe("test-refresh-credential-must-not-be-stored-in-plaintext");
  });

  it("rejects disconnecting another tenant's mailbox and erases local token on real disconnect", async () => {
    const revoked: string[] = [];
    expect(await service.disconnectGmailMailbox({
      organizationId: otherOrgId,
      connectionId,
      revoke: async (token) => { revoked.push(token); },
    })).toBe(false);
    expect(revoked).toHaveLength(0);

    expect(await service.disconnectGmailMailbox({
      organizationId: primaryOrgId,
      connectionId,
      revoke: async (token) => { revoked.push(token); },
    })).toBe(true);
    expect(revoked).toEqual(["test-refresh-credential-must-not-be-stored-in-plaintext"]);
    const current = await prisma.mailboxConnection.findFirstOrThrow({ where: { id: connectionId } });
    expect(current.encryptedRefreshToken).toBe("");
    expect(current.disconnectedAt).not.toBeNull();
    expect(await service.listGmailMailboxConnections(primaryOrgId)).toHaveLength(0);
    expect(await service.disconnectGmailMailbox({
      organizationId: primaryOrgId, connectionId,
    })).toBe(false);
  });
});
