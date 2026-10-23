import { CalculationStatus, OrganizationRole, SupplierOfferSource } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("supplier confirmation belongs to the project and keeps costs separate", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/negotiation/application/supplier-confirmation-service");
  let costService: typeof import("@/modules/cost-engine/application/cost-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;

  const result = {
    title: "Wholesale reading glasses model 18107",
    supplierName: "Wenzhou Youge Eyewear Co., Ltd.",
    supplierCountry: "CN",
    price: 0.7,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: "FOB",
    productUrl: "https://ugeeyewear.en.made-in-china.com/product/confirmation-example.html",
    imageUrl: null,
    source: "made-in-china.com",
  };
  const writtenQuote = "Unit price USD 1.05 for 1000 pcs. MOQ 100. FOB Ningbo. Lead time 30 days. +1.00 to +3.50 available. Freight USD 400. Customs USD 90.";

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/negotiation/application/supplier-confirmation-service");
    costService = await import("@/modules/cost-engine/application/cost-service");
    const user = await prisma.user.create({
      data: { email: `confirmation-${crypto.randomUUID()}@example.test`, name: "Confirmation Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Confirmation Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Confirmation Org" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "naočare za čitanje",
        targetCountry: "DE",
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

  it("stores the RFQ for the project and does not turn freight into the supplier price", async () => {
    const prepared = await service.prepareSupplierConfirmation(projectId, organizationId, {
      productName: "naočare za čitanje",
      result,
    });
    const again = await service.prepareSupplierConfirmation(projectId, organizationId, {
      productName: "naočare za čitanje",
      result,
    });
    expect(again.id).toBe(prepared.id);
    expect(prepared.record.status).toBe("PREPARED");
    expect(prepared.body).toContain("not an order");
    expect(prepared.record.supplierPriceConfirmed).toBe(false);

    await expect(service.getSupplierConfirmation(
      projectId,
      otherOrganizationId,
      result.productUrl,
    )).rejects.toBeInstanceOf(service.SupplierConfirmationProjectNotFoundError);

    const sent = await service.markSupplierConfirmationSent(
      projectId,
      organizationId,
      result.productUrl,
    );
    expect(sent.record.status).toBe("SENT");
    await expect(service.saveSupplierConfirmationReply(projectId, organizationId, {
      productUrl: result.productUrl,
      responseNote: "",
      writtenQuote: "",
    })).rejects.toBeInstanceOf(service.SupplierConfirmationStateError);

    const received = await service.saveSupplierConfirmationReply(projectId, organizationId, {
      productUrl: result.productUrl,
      responseNote: "Supplier replied by email.",
      writtenQuote,
    });
    expect(received.record.status).toBe("RESPONSE_RECEIVED");
    expect(received.record.proposals.find((item) => item.key === "UNIT_PRICE")?.confirmed).toBe(false);
    expect(received.record.orderTermsConfirmed).toBe(false);
    await expect(service.transferSupplierConfirmationToOffer(
      projectId,
      organizationId,
      result.productUrl,
    )).rejects.toBeInstanceOf(service.SupplierConfirmationStateError);

    const documented = await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "UNIT_PRICE",
    });
    expect(documented.record.supplierPriceConfirmed).toBe(true);
    expect(documented.record.orderTermsConfirmed).toBe(false);
    expect(documented.record.transportConfirmed).toBe(false);
    expect(documented.record.vatConfirmed).toBe(false);

    const transferred = await service.transferSupplierConfirmationToOffer(
      projectId,
      organizationId,
      result.productUrl,
    );
    const offer = await prisma.supplierOffer.findFirstOrThrow({
      where: { id: transferred.offerId ?? "", organizationId, projectId },
      include: { costCalculations: true },
    });
    expect(offer.source).toBe(SupplierOfferSource.SEARCH_RESULT);
    expect(Number(offer.unitPrice)).toBe(1.05);
    expect(offer.currency).toBe("USD");
    expect(offer.moq).toBeNull();
    expect(offer.incoterm).toBeNull();
    expect(offer.rawExtractedText).toContain("Freight USD 400");
    expect(offer.costCalculations).toHaveLength(0);
    expect(offer.sourceMetadata).toMatchObject({
      supplierConfirmation: {
        supplierPriceConfirmed: true,
        orderTermsConfirmed: false,
        transportConfirmed: false,
        customsConfirmed: false,
        vatConfirmed: false,
        otherCostsConfirmed: false,
      },
    });

    await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "ORDER_QUANTITY",
    });
    await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "MOQ",
    });
    await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "DIOPTERS",
    });
    const complete = await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "INCOTERM",
    });
    expect(complete.record.orderTermsConfirmed).toBe(true);
    const updated = await service.transferSupplierConfirmationToOffer(
      projectId,
      organizationId,
      result.productUrl,
    );
    const priced = await prisma.supplierOffer.findFirstOrThrow({
      where: { id: updated.offerId ?? "", organizationId },
    });
    expect(priced.moq).toBe(100);
    expect(priced.incoterm).toBe("FOB");
    expect(priced.deliveryTimeDays).toBeNull();

    const calculation = await costService.createCostCalculation(priced.id, organizationId, {
      shippingCost: "50.00",
      customsDutyRate: "0",
      vatRate: "19",
      storageCost: "0",
      inspectionCost: "0",
      otherCosts: "0",
      targetSellingPrice: "5.00",
      calculationStatus: CalculationStatus.CALCULATED,
    });
    expect(Number(calculation.unitPrice)).toBe(1.05);
    expect(Number(calculation.shippingCost)).toBe(50);
    expect(Number(calculation.shippingCost)).not.toBe(400);
  });
});
