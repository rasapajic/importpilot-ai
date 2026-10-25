import { createHash, randomBytes, randomUUID } from "node:crypto";
import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GoogleGmailSendProvider } from "../../modules/negotiation/infrastructure/google-gmail-send-provider";

const database = process.env.TEST_DATABASE_URL;
const describeWithDatabase = database ? describe : describe.skip;

describeWithDatabase("Gmail supplier sending is one-shot, audited and tenant safe", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let mail: typeof import("@/modules/negotiation/application/supplier-gmail-send-service");
  let confirmationService: typeof import("@/modules/negotiation/application/supplier-confirmation-service");
  let cryptoModule: typeof import("@/modules/negotiation/infrastructure/gmail-credential-crypto");
  let ownerId = "";
  let organizationId = "";
  let foreignOrgId = "";
  let projectId = "";
  let connectionId = "";
  const originalEnv = Object.fromEntries([
    "DATABASE_URL",
    "RENDER_SERVICE_ID",
    "JAKOV360_GMAIL_STAGING_ENABLED",
    "JAKOV360_GMAIL_CLIENT_ID",
    "JAKOV360_GMAIL_CLIENT_SECRET",
    "JAKOV360_GMAIL_REDIRECT_URI",
    "JAKOV360_GMAIL_TOKEN_KEY_V1_B64",
    "JAKOV360_GMAIL_TEST_RECIPIENTS",
    "APP_ORIGIN",
  ].map((key) => [key, process.env[key]]));

  const productUrl = (suffix: string) => `https://example.test/catalog/${suffix}`;
  const source = "Molimo ponudu za 1.000 komada naočara.";
  const translated = "Please quote 1,000 reading glasses, mixed diopters.";
  const hash = createHash("sha256").update(`EN\n${source}`).digest("hex");

  function request(suffix: string, recipient = "recipient@example.test") {
    return {
      organizationId,
      userId: ownerId,
      projectId,
      productUrl: productUrl(suffix),
      mailboxConnectionId: connectionId,
      recipient,
    };
  }

  async function prepare(suffix: string) {
    const result = {
      title: "Zlin 2025 Retro Round Reading Glasses",
      supplierName: "Demo Eyewear",
      supplierCountry: "CN",
      price: 1.2,
      currency: "USD",
      minimumOrderQuantity: 12,
      incoterm: "FOB",
      productUrl: productUrl(suffix),
      imageUrl: null,
      source: "made-in-china.com",
    };
    const created = await prisma.supplierConfirmation.create({
      data: {
        organizationId,
        projectId,
        productName: "[DEMO] fixed reading glasses",
        productUrl: result.productUrl,
        status: "PREPARED",
        subject: "JAKOV360 TEST RFQ — Zlin 2025",
        body: source,
        sourceResult: result,
        proposals: [],
        sourceMessage: source,
        targetLanguage: "EN",
        translatedMessage: translated,
        translationInputHash: hash,
      },
    });
    return created;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
    process.env.JAKOV360_GMAIL_STAGING_ENABLED = "true";
    process.env.JAKOV360_GMAIL_CLIENT_ID = "synthetic-test-client";
    process.env.JAKOV360_GMAIL_CLIENT_SECRET = "synthetic-test-secret";
    process.env.JAKOV360_GMAIL_REDIRECT_URI =
      "https://jakov360-acceptance-staging.onrender.com/api/mail/google/callback";
    process.env.APP_ORIGIN = "https://jakov360-acceptance-staging.onrender.com";
    process.env.JAKOV360_GMAIL_TEST_RECIPIENTS = "recipient@example.test";
    process.env.JAKOV360_GMAIL_TOKEN_KEY_V1_B64 = randomBytes(32).toString("base64url");
    ({ prisma } = await import("@/lib/database/prisma"));
    mail = await import("@/modules/negotiation/application/supplier-gmail-send-service");
    confirmationService = await import("@/modules/negotiation/application/supplier-confirmation-service");
    cryptoModule = await import("@/modules/negotiation/infrastructure/gmail-credential-crypto");

    const user = await prisma.user.create({
      data: { email: `gmail-outbound-${randomUUID()}@example.test`, name: "M1c Test Owner" },
    });
    ownerId = user.id;
    const primary = await prisma.organization.create({
      data: {
        name: "M1c Primary Org",
        members: { create: { userId: ownerId, role: OrganizationRole.OWNER } },
      },
    });
    organizationId = primary.id;
    const foreign = await prisma.organization.create({ data: { name: "M1c Foreign Org" } });
    foreignOrgId = foreign.id;
    const project = await prisma.importProject.create({
      data: {
        organizationId,
        createdById: ownerId,
        name: "[DEMO] Zlin 2025",
        targetCountry: "RS",
        quantity: 1000,
        targetMargin: 20,
      },
    });
    projectId = project.id;
    const linked = await prisma.mailboxConnection.create({
      data: {
        organizationId,
        connectedByUserId: ownerId,
        provider: "GMAIL",
        providerAccountId: "google-sub-m1c-test",
        mailboxEmail: "buyer@example.test",
        encryptedRefreshToken: cryptoModule.encryptGmailRefreshToken(
          "fake-refresh-token",
          organizationId,
          "google-sub-m1c-test",
        ),
        grantedScopes: "openid email https://www.googleapis.com/auth/gmail.send",
      },
    });
    connectionId = linked.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
      if (foreignOrgId) await prisma.organization.delete({ where: { id: foreignOrgId } });
      if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
      await prisma.$disconnect();
    }
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it("previews only saved current translation and blocks foreign tenants and unlisted recipients", async () => {
    await prepare("preview");
    const ready = await mail.getSupplierGmailSendPreview(request("preview"));
    expect(ready).toMatchObject({
      status: "READY",
      from: "buyer@example.test",
      to: "recipient@example.test",
      body: translated,
    });
    expect(ready.approvalHash).toMatch(/^[0-9a-f]{64}$/);

    await expect(mail.getSupplierGmailSendPreview({
      ...request("preview"), organizationId: foreignOrgId,
    })).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    await expect(mail.getSupplierGmailSendPreview({
      ...request("preview"), userId: randomUUID(),
    })).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    await expect(mail.getSupplierGmailSendPreview(
      request("preview", "real-supplier@example.cn"),
    )).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
  });

  it("sends once with exact consent and saves Gmail thread and message evidence", async () => {
    const conf = await prepare("success");
    const wanted = request("success");
    const preview = await mail.getSupplierGmailSendPreview(wanted);
    if (!preview.approvalHash) throw new Error("Expected approved preview hash");
    const sentRaw: string[] = [];
    const provider: GoogleGmailSendProvider = {
      async send({ raw, refreshToken }) {
        sentRaw.push(raw);
        expect(refreshToken).toBe("fake-refresh-token");
        return { providerMessageId: "gmail-message-one", providerThreadId: "gmail-thread-one" };
      },
    };

    await expect(mail.sendSupplierGmailInquiry({
      ...wanted,
      approvedHash: "b".repeat(64),
      explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    expect(sentRaw).toHaveLength(0);
    expect(await prisma.supplierMailDelivery.count({ where: { confirmationId: conf.id } })).toBe(0);

    const result = await mail.sendSupplierGmailInquiry({
      ...wanted, approvedHash: preview.approvalHash, explicitApproval: true,
    }, provider);
    expect(result).toEqual({
      status: "SENT",
      providerMessageId: "gmail-message-one",
      providerThreadId: "gmail-thread-one",
    });
    expect(sentRaw).toHaveLength(1);
    const sentMime = Buffer.from(sentRaw[0], "base64url").toString("utf8");
    expect(sentMime).toContain("To: recipient@example.test");
    expect(sentMime).toContain("Subject: =?UTF-8?B?");
    const evidence = await prisma.supplierMailDelivery.findFirstOrThrow({
      where: { organizationId, confirmationId: conf.id },
    });
    expect(evidence).toMatchObject({
      status: "SENT",
      providerMessageId: "gmail-message-one",
      providerThreadId: "gmail-thread-one",
      recipientEmail: "recipient@example.test",
      approvedHash: preview.approvalHash,
    });
    expect(evidence.rfcMessageId).toMatch(/^<[^<>\s]+@jakov360.com>$/);
    expect((await prisma.supplierConfirmation.findUniqueOrThrow({ where: { id: conf.id } })).status).toBe("SENT");

    await expect(mail.sendSupplierGmailInquiry({
      ...wanted, approvedHash: preview.approvalHash, explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    expect(sentRaw).toHaveLength(1);
    await expect(confirmationService.markSupplierConfirmationSent(projectId, organizationId, wanted.productUrl))
      .rejects.toBeInstanceOf(confirmationService.SupplierConfirmationStateError);
  });

  it("invalidates the approved review when a source changes before sending", async () => {
    const conf = await prepare("edited");
    const wanted = request("edited");
    const preview = await mail.getSupplierGmailSendPreview(wanted);
    if (!preview.approvalHash) throw new Error("Missing review hash");
    await prisma.supplierConfirmation.update({
      where: { id: conf.id },
      data: { sourceMessage: source + " Promenjena količina" },
    });
    let called = 0;
    await expect(mail.sendSupplierGmailInquiry({
      ...wanted, approvedHash: preview.approvalHash, explicitApproval: true,
    }, { send: async () => { called += 1; return { providerMessageId: "x", providerThreadId: "y" }; } }))
      .rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    expect(called).toBe(0);
    expect(await prisma.supplierMailDelivery.count({ where: { confirmationId: conf.id } })).toBe(0);
  });

  it("locks an indeterminate Gmail send and never retries it", async () => {
    const conf = await prepare("uncertain");
    const wanted = request("uncertain");
    const preview = await mail.getSupplierGmailSendPreview(wanted);
    if (!preview.approvalHash) throw new Error("Missing review hash");
    let calls = 0;
    const provider: GoogleGmailSendProvider = {
      async send() {
        calls += 1;
        throw new Error("Synthetic timeout after Gmail dispatch");
      },
    };
    await expect(mail.sendSupplierGmailInquiry({
      ...wanted, approvedHash: preview.approvalHash, explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(mail.SupplierGmailSendUncertainError);
    const attempt = await prisma.supplierMailDelivery.findFirstOrThrow({
      where: { confirmationId: conf.id },
    });
    expect(attempt.status).toBe("UNCERTAIN");
    expect(attempt.providerMessageId).toBeNull();
    expect((await prisma.supplierConfirmation.findUniqueOrThrow({ where: { id: conf.id } })).status).toBe("PREPARED");
    await expect(mail.sendSupplierGmailInquiry({
      ...wanted, approvedHash: preview.approvalHash, explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(mail.SupplierGmailSendBlockedError);
    expect(calls).toBe(1);
    await expect(confirmationService.markSupplierConfirmationSent(projectId, organizationId, wanted.productUrl))
      .rejects.toBeInstanceOf(confirmationService.SupplierConfirmationStateError);
  });

  it("serializes concurrent attempts to the same confirmation", async () => {
    const conf = await prepare("race");
    const wanted = request("race");
    const preview = await mail.getSupplierGmailSendPreview(wanted);
    if (!preview.approvalHash) throw new Error("Missing review hash");
    let calls = 0;
    const provider: GoogleGmailSendProvider = {
      async send() {
        calls += 1;
        return { providerMessageId: "gmail-race-id", providerThreadId: "gmail-race-thread" };
      },
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => mail.sendSupplierGmailInquiry({
        ...wanted, approvedHash: preview.approvalHash!, explicitApproval: true,
      }, provider)),
    );
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(calls).toBe(1);
    expect(await prisma.supplierMailDelivery.count({ where: { confirmationId: conf.id } })).toBe(1);
  });
});
