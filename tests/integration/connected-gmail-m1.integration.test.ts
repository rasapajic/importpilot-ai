import { createHash, randomBytes } from "node:crypto";
import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const db = process.env.TEST_DATABASE_URL;
const describeWithDb = db ? describe : describe.skip;

describeWithDb("Gmail M1 tenant and one-send persistence", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let createConfirmation: typeof import("@/modules/negotiation/application/supplier-confirmation-service").prepareSupplierConfirmation;
  let service: typeof import("@/modules/negotiation/application/connected-supplier-mail-service");
  let encrypt: typeof import("@/modules/negotiation/infrastructure/mailbox-token-vault").encryptMailboxSecret;
  let organizationId: string;
  let userId: string;
  let projectId: string;
  let connectionId: string;
  let confirmationId: string;
  let productUrl: string;
  let savedTranslation: string;
  const allowedRecipient = "secondary-test@example.test";
  const key = randomBytes(32).toString("base64");
  const sentCalls: string[] = [];

  const resultFor = (url: string) => ({
    title: "Zlin 2025 Retro Round reading glasses",
    supplierName: "DEMO TEST SUPPLIER",
    supplierCountry: "CN",
    price: 1.2,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl: url,
    imageUrl: null,
    source: "made-in-china.com",
  });

  async function prepare(project: string, url: string) {
    const prepared = await createConfirmation(project, organizationId, {
      productName: "Reading glasses +1.00 to +3.50",
      result: resultFor(url),
    });
    const source = "Poštovani, narudžbina 1.000 komada, dioptrije +1.00 do +3.50.";
    const translated = "Dear Supplier, TEST DEMO, quantity 1,000 pieces. Zlin 2025 +1.00 to +3.50. Not an order.";
    await prisma.supplierConfirmation.update({
      where: { id: prepared.id },
      data: {
        sourceMessage: source,
        translatedMessage: translated,
        targetLanguage: "EN",
        translationInputHash: createHash("sha256").update(`EN\n${source}`).digest("hex"),
      },
    });
    return { id: prepared.id, translated };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = db;
    ({ prisma } = await import("@/lib/database/prisma"));
    ({ prepareSupplierConfirmation: createConfirmation } = await import(
      "@/modules/negotiation/application/supplier-confirmation-service"
    ));
    service = await import("@/modules/negotiation/application/connected-supplier-mail-service");
    ({ encryptMailboxSecret: encrypt } = await import(
      "@/modules/negotiation/infrastructure/mailbox-token-vault"
    ));

    const user = await prisma.user.create({
      data: {
        email: `gmail-m1-${crypto.randomUUID()}@example.test`,
        name: "M1 Test Owner",
      },
    });
    userId = user.id;
    const org = await prisma.organization.create({
      data: {
        name: "M1 Test Company",
        members: { create: { userId, role: OrganizationRole.OWNER } },
      },
    });
    organizationId = org.id;
    const project = await prisma.importProject.create({
      data: {
        organizationId, createdById: userId, name: "[DEMO] Glasses test",
        quantity: 1000, targetCountry: "RS", targetMargin: 20,
      },
    });
    projectId = project.id;
    productUrl = `https://example.test/products/zlin-${crypto.randomUUID()}`;
    const prepared = await prepare(projectId, productUrl);
    confirmationId = prepared.id;
    savedTranslation = prepared.translated;

    vi.stubEnv("RENDER_SERVICE_ID", "srv-datu3v093c1s73c17m60");
    vi.stubEnv("JAKOV360_GMAIL_TEST_ENABLED", "1");
    vi.stubEnv("JAKOV360_GMAIL_TEST_ORG_ID", organizationId);
    vi.stubEnv("JAKOV360_GMAIL_TEST_RECIPIENT", allowedRecipient);
    vi.stubEnv("GOOGLE_MAIL_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_MAIL_CLIENT_SECRET", "fake-test-secret");
    vi.stubEnv("GOOGLE_MAIL_OAUTH_REDIRECT_URI",
      "https://jakov360-acceptance-staging.onrender.com/api/mail/gmail/callback");
    vi.stubEnv("JAKOV360_MAIL_TOKEN_KEYS_JSON", JSON.stringify({ v1: key }));
    vi.stubEnv("JAKOV360_MAIL_ACTIVE_KEY_VERSION", "v1");

    connectionId = crypto.randomUUID();
    const secret = encrypt(
      "fake-refresh-token",
      `mailbox:${organizationId}:${connectionId}`,
    );
    await prisma.mailboxConnection.create({
      data: {
        id: connectionId, organizationId, userId, provider: "GMAIL",
        emailAddress: "primary-test@example.test",
        encryptedRefreshToken: secret.ciphertext,
        tokenKeyVersion: secret.version,
      },
    });

    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      const address = String(url);
      if (address.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "fake-access" }), { status: 200 });
      }
      if (address.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
        sentCalls.push(String(init?.body));
        return new Response(JSON.stringify({
          id: `gmail-message-${sentCalls.length}`,
          threadId: `gmail-thread-${sentCalls.length}`,
        }), { status: 200 });
      }
      if (address.includes("oauth2.googleapis.com/revoke")) {
        return new Response("", { status: 200 });
      }
      throw new Error("unexpected test-only HTTP endpoint");
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (!prisma || !organizationId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("denies crossing tenant boundaries or contacting non-test suppliers", async () => {
    await expect(service.previewSupplierMail(
      { userId, organizationId: crypto.randomUUID() },
      { projectId, connectionId, productUrl, recipient: allowedRecipient },
    )).rejects.toBeInstanceOf(service.SupplierMailUnavailableError);
    await expect(service.previewSupplierMail(
      { userId, organizationId },
      { projectId, connectionId, productUrl, recipient: "real-supplier@example.cn" },
    )).rejects.toBeInstanceOf(service.SupplierMailUnavailableError);
  });

  it("invalidates approval when the source or translated message changes", async () => {
    const first = await service.previewSupplierMail({ userId, organizationId }, {
      projectId, connectionId, productUrl, recipient: allowedRecipient,
    });
    expect(first.body).toContain("1,000 pieces");
    expect(first.to).toBe(allowedRecipient);
    const translation = savedTranslation;
    await prisma.supplierConfirmation.update({
      where: { id: confirmationId },
      data: { translatedMessage: `${translation} Now changed.` },
    });
    await expect(service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl, approvalToken: first.approvalToken, approved: true,
    })).rejects.toBeInstanceOf(service.SupplierMailRequestDeniedError);
    await expect(service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl, approvalToken: first.approvalToken, approved: false,
    })).rejects.toBeInstanceOf(service.SupplierMailRequestDeniedError);
    expect(await prisma.supplierMailOutbound.count({
      where: { organizationId, confirmationId },
    })).toBe(0);
    await prisma.supplierConfirmation.update({
      where: { id: confirmationId }, data: { translatedMessage: translation },
    });
  });

  it("sends once, persists Gmail message/thread evidence and updates status", async () => {
    const preview = await service.previewSupplierMail({ userId, organizationId }, {
      projectId, connectionId, productUrl, recipient: allowedRecipient,
    });
    const sent = await service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl, approvalToken: preview.approvalToken, approved: true,
    });
    expect(sent.status).toBe("SENT");
    const receipt = await prisma.supplierMailOutbound.findFirstOrThrow({
      where: { organizationId, confirmationId },
    });
    expect(receipt.status).toBe("SENT");
    expect(receipt.providerMessageId).toBe("gmail-message-1");
    expect(receipt.providerThreadId).toBe("gmail-thread-1");
    expect(receipt.rfcMessageId).toMatch(/^<.+@jakov360\.com>$/);
    expect(await prisma.supplierConfirmation.findUniqueOrThrow({
      where: { id: confirmationId },
    })).toMatchObject({ status: "SENT" });
    expect(sentCalls).toHaveLength(1);
    await expect(service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl, approvalToken: preview.approvalToken, approved: true,
    })).rejects.toThrow();
    expect(sentCalls).toHaveLength(1);
  });

  it("blocks repeat send after unknown provider outcome without marking the RFQ sent", async () => {
    const otherUrl = `https://example.test/products/second-${crypto.randomUUID()}`;
    const created = await prepare(projectId, otherUrl);
    const preview = await service.previewSupplierMail({ userId, organizationId }, {
      projectId, connectionId, productUrl: otherUrl, recipient: allowedRecipient,
    });
    vi.stubGlobal("fetch", async (url: unknown) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "fake-access" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "temporary_failure" }), { status: 502 });
    });
    await expect(service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl: otherUrl, approvalToken: preview.approvalToken, approved: true,
    })).rejects.toBeInstanceOf(service.SupplierMailDeliveryUncertainError);
    expect(await prisma.supplierMailOutbound.findFirstOrThrow({
      where: { organizationId, confirmationId: created.id },
    })).toMatchObject({ status: "UNKNOWN" });
    expect(await prisma.supplierConfirmation.findUniqueOrThrow({
      where: { id: created.id },
    })).toMatchObject({ status: "PREPARED" });
    await expect(service.sendApprovedSupplierMail({ userId, organizationId }, {
      projectId, productUrl: otherUrl, approvalToken: preview.approvalToken, approved: true,
    })).rejects.toThrow();
  });

  it("disconnect removes usable credentials but keeps provider send evidence", async () => {
    // Restore expected revoke endpoint after testing failure handling.
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    const outcome = await service.disconnectGmailMailbox({ userId, organizationId }, connectionId);
    expect(outcome).toEqual({ disconnected: true, providerRevocationConfirmed: true });
    const connection = await prisma.mailboxConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(connection.encryptedRefreshToken).toBeNull();
    expect(connection.disconnectedAt).not.toBeNull();
    expect(await prisma.supplierMailOutbound.count({
      where: { organizationId, confirmationId, status: "SENT" },
    })).toBe(1);
  });
});
