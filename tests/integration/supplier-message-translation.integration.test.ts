import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { supplierMessageUsageEvent } from "../../modules/negotiation/domain/supplier-message-cost";
import type { SupplierMessageTranslator } from "../../modules/negotiation/infrastructure/openai-supplier-message-translator";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function translator(mode: "preserve" | "drop"): SupplierMessageTranslator & { calls: number } {
  const client = {
    calls: 0,
    async translate(input: { text: string; target: "EN" | "ZH" | "EN_ZH"; direction: "outbound" | "reply" }) {
      client.calls += 1;
      const text = mode === "drop"
        ? "nema podataka"
        : input.target === "EN_ZH"
          ? `${input.text}\n---\n${input.text}`
          : `Prevod: ${input.text}`;
      return {
        text,
        usage: supplierMessageUsageEvent({
          operation: input.direction === "reply"
            ? "supplier_reply_translation"
            : "supplier_message_translation",
          model: "gpt-5-mini",
          responseId: `resp-${crypto.randomUUID()}`,
          inputTokens: 100,
          cachedInputTokens: 20,
          outputTokens: 40,
          totalTokens: 140,
          durationMs: 15,
        }),
      };
    },
  };
  return client;
}

describeWithDatabase("supplier message translation stays in the project and skips repeat AI calls", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/negotiation/application/supplier-confirmation-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;
  const productUrl = "https://zlin.en.made-in-china.com/product/message-translation.html";
  const result = {
    title: "Reading glasses",
    supplierName: "Wenzhou Zlin Eyewear Co., Ltd.",
    supplierCountry: "CN",
    price: 1.1,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "made-in-china.com",
  };
  const writtenQuote = "Unit price USD 1.05 for 1000 pcs. MOQ 100. FOB Ningbo. +1.00 to +3.50 available. Mixed diopters are confirmed in one order.";

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/negotiation/application/supplier-confirmation-service");
    const user = await prisma.user.create({
      data: { email: `message-${crypto.randomUUID()}@example.test`, name: "Message Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Message Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Message Org" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "naočare za čitanje",
        targetCountry: "RS",
        quantity: 1000,
        targetMargin: 20,
      },
    });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    projectId = project.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("translates once, keeps a correction, and does not confirm terms from the reply translation", async () => {
    const prepared = await service.prepareSupplierConfirmation(projectId, organizationId, {
      productName: "naočare za čitanje",
      result,
    });
    expect(prepared.communication.sourceMessage).toContain("Wenzhou Zlin Eyewear Co., Ltd.");
    expect(prepared.communication.sourceMessage).toContain("1.000");
    expect(prepared.communication.sourceMessage).toContain("Srbija");

    const client = translator("preserve");
    await expect(service.translateSupplierInquiry(projectId, otherOrganizationId, {
      productUrl,
      sourceMessage: prepared.communication.sourceMessage,
      targetLanguage: "EN",
    }, client)).rejects.toBeInstanceOf(service.SupplierConfirmationProjectNotFoundError);
    expect(client.calls).toBe(0);

    const translated = await service.translateSupplierInquiry(projectId, organizationId, {
      productUrl,
      sourceMessage: prepared.communication.sourceMessage,
      targetLanguage: "EN",
    }, client);
    expect(client.calls).toBe(1);
    expect(translated.communication.translationCurrent).toBe(true);
    expect(translated.communication.translationReused).toBe(false);
    expect(translated.communication.translatedMessage.startsWith("Prevod:")).toBe(true);
    expect(translated.communication.estimatedCostUsd).toBeTruthy();
    const usageAfterFirst = await prisma.aiUsageEvent.count({
      where: { organizationId, projectId, operation: "supplier_message_translation" },
    });
    expect(usageAfterFirst).toBe(1);
    const stored = await prisma.aiUsageEvent.findFirstOrThrow({
      where: { organizationId, projectId, operation: "supplier_message_translation" },
    });
    expect(stored.modelName).toBe("gpt-5-mini");
    expect(stored.inputTokens).toBe(100);
    expect(stored.cachedInputTokens).toBe(20);
    expect(stored.outputTokens).toBe(40);
    expect(Number(stored.estimatedTotalCostUsd)).toBeGreaterThan(0);

    const correctedText = `${translated.communication.translatedMessage}\nPlease confirm the written quotation.`;
    const corrected = await service.saveSupplierTranslatedMessage(projectId, organizationId, {
      productUrl,
      translatedMessage: correctedText,
    });
    expect(corrected.communication.translatedMessage).toBe(correctedText);

    const reused = await service.translateSupplierInquiry(projectId, organizationId, {
      productUrl,
      sourceMessage: prepared.communication.sourceMessage,
      targetLanguage: "EN",
    }, client);
    expect(client.calls).toBe(1);
    expect(reused.communication.translationReused).toBe(true);
    expect(reused.communication.translatedMessage).toBe(correctedText);
    expect(reused.communication.estimatedCostUsd).toBeNull();
    expect(await prisma.aiUsageEvent.count({
      where: { organizationId, projectId, operation: "supplier_message_translation" },
    })).toBe(1);

    const failing = translator("drop");
    await expect(service.translateSupplierInquiry(projectId, organizationId, {
      productUrl,
      sourceMessage: prepared.communication.sourceMessage,
      targetLanguage: "ZH",
    }, failing)).rejects.toBeInstanceOf(service.SupplierMessageFactError);
    expect(failing.calls).toBe(1);
    const afterFailure = await service.getSupplierConfirmation(projectId, organizationId, productUrl);
    expect(afterFailure.communication.translatedMessage).toBe(correctedText);
    expect(afterFailure.communication.translationCurrent).toBe(false);
    expect(await prisma.aiUsageEvent.count({
      where: { organizationId, projectId, operation: "supplier_message_translation" },
    })).toBe(2);

    await service.markSupplierConfirmationSent(projectId, organizationId, productUrl);
    const replyClient = translator("preserve");
    await expect(service.translateSupplierReply(projectId, otherOrganizationId, {
      productUrl,
      responseNote: "Email",
      writtenQuote,
    }, replyClient)).rejects.toBeInstanceOf(service.SupplierConfirmationProjectNotFoundError);
    expect(replyClient.calls).toBe(0);

    const received = await service.translateSupplierReply(projectId, organizationId, {
      productUrl,
      responseNote: "Email",
      writtenQuote,
    }, replyClient);
    expect(replyClient.calls).toBe(1);
    expect(received.record.writtenQuote).toBe(writtenQuote);
    expect(received.communication.supplierReplyOriginal).toBe(writtenQuote);
    expect(received.communication.supplierReplyTranslation.startsWith("Prevod:")).toBe(true);
    expect(received.record.proposals.find((item) => item.key === "UNIT_PRICE")?.confirmed).toBe(false);
    expect(received.record.supplierPriceConfirmed).toBe(false);
    expect(received.communication.followUpQuestions.join(" ")).toContain("rok isporuke");
    expect(received.communication.followUpQuestions.join(" ")).toContain("zalihama");

    const documented = await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl,
      termKey: "UNIT_PRICE",
    });
    expect(documented.record.supplierPriceConfirmed).toBe(true);

    const repeated = await service.translateSupplierReply(projectId, organizationId, {
      productUrl,
      responseNote: "Email",
      writtenQuote,
    }, replyClient);
    expect(replyClient.calls).toBe(1);
    expect(repeated.communication.translationReused).toBe(true);
    expect(repeated.record.proposals.find((item) => item.key === "UNIT_PRICE")?.confirmed).toBe(true);
    expect(await prisma.aiUsageEvent.count({
      where: { organizationId, projectId, operation: "supplier_reply_translation" },
    })).toBe(1);
  });
});
