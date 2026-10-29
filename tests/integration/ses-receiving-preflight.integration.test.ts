import { beforeAll, describe, expect, it } from "vitest";

import { generateReplyToken } from "@/modules/supplier-inbox/domain/reply-token";
import {
  admitSesReceivingNotice,
  createSesDeliveryGate,
  createSesPreflightContext,
  SES_PREFLIGHT_BINDING,
} from "@/modules/supplier-inbox/domain/ses-receiving";
import {
  createFixtureMaterial,
  signedSnsNotification,
} from "@/tests/helpers/ses-preflight-fixture";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("SES receiving preflight does not write mail", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
  });

  it("admits a signed fixture without an inbound row or an outbound message", async () => {
    const material = createFixtureMaterial();
    const messageId = `ses${crypto.randomUUID().replaceAll("-", "")}`;
    const marker = `ses-preflight-${crypto.randomUUID()}`;
    const result = await admitSesReceivingNotice({
      snsMessage: signedSnsNotification(material, {
        token: generateReplyToken(),
        messageId,
        subject: marker,
      }),
      pinnedCertificates: [{ signingCertUrl: material.certUrl, pem: material.pem }],
      binding: SES_PREFLIGHT_BINDING,
      now: material.now,
      context: createSesPreflightContext("ephemeral-db-fixture"),
      env: { JAKOV360_INBOUND_MAIL_ENABLED: "true" },
      gate: createSesDeliveryGate(),
    });

    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(false);
    expect(result.followUpSent).toBe(false);
    expect(result.costEngineWrite).toBe(false);
    expect(await prisma.supplierInboundMessage.findFirst({ where: { providerMessageId: messageId } })).toBeNull();
    expect(await prisma.supplierOutboundMessage.findFirst({
      where: { OR: [{ providerMessageId: messageId }, { subject: marker }] },
    })).toBeNull();
  });

  it("does not write when the inbound flag is absent", async () => {
    const material = createFixtureMaterial();
    const messageId = `ses${crypto.randomUUID().replaceAll("-", "")}`;
    const result = await admitSesReceivingNotice({
      snsMessage: signedSnsNotification(material, {
        token: generateReplyToken(),
        messageId,
      }),
      pinnedCertificates: [{ signingCertUrl: material.certUrl, pem: material.pem }],
      binding: SES_PREFLIGHT_BINDING,
      now: material.now,
      context: createSesPreflightContext("ephemeral-db-flag-off"),
      env: {},
      gate: createSesDeliveryGate(),
    });

    expect(result.reason).toBe("FLAG_DISABLED");
    expect(await prisma.supplierInboundMessage.findFirst({ where: { providerMessageId: messageId } })).toBeNull();
    expect(await prisma.supplierOutboundMessage.findFirst({ where: { providerMessageId: messageId } })).toBeNull();
  });
});
