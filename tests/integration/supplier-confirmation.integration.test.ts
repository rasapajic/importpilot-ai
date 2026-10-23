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
  const writtenQuote = "Unit price USD 1.05 for 1000 pcs. MOQ 100. FOB Ningbo. Lead time 30 days. +1.00 to +3.50 available. Mixed diopters are confirmed in one order. Freight USD 400. Customs USD 90.";

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
    const statedRange = await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "DIOPTERS",
    });
    expect(statedRange.record.variantsConfirmed).toBe(false);
    expect(statedRange.record.orderTermsConfirmed).toBe(false);
    await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl: result.productUrl,
      termKey: "VARIANT_MIXING",
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

  it("keeps an older calculation as history when a confirmed price replaces it", async () => {
    const productUrl = "https://ugeeyewear.en.made-in-china.com/product/confirmation-history.html";
    const savedOffer = await prisma.supplierOffer.create({
      data: {
        organizationId,
        projectId,
        supplierName: "History Eyewear Co., Ltd.",
        supplierCountry: "CN",
        source: SupplierOfferSource.SEARCH_RESULT,
        unitPrice: "0.70",
        currency: "USD",
        incoterm: "FOB",
        sourceMetadata: { productUrl },
      },
    });
    const historical = await costService.createCostCalculation(savedOffer.id, organizationId, {
      shippingCost: "40.00",
      customsDutyRate: "0",
      vatRate: "19",
      storageCost: "0",
      inspectionCost: "0",
      otherCosts: "0",
      targetSellingPrice: "4.00",
      calculationStatus: CalculationStatus.CALCULATED,
    });
    await prisma.costCalculation.update({
      where: { id: historical.id },
      data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const assessmentService = await import("@/modules/intelligence/application/assessment-service");
    const decisionService = await import("@/modules/decisions/application/project-decision-service");
    const projectService = await import("@/modules/projects/application/project-service");
    const { decisionRemainsCurrent } = await import("@/modules/decisions/domain/current-decision");
    await assessmentService.assessSupplierOffer(savedOffer.id, organizationId);
    const decision = await decisionService.generateProjectDecision(
      projectId,
      organizationId,
      savedOffer.id,
    );
    expect(decision.selectedOfferId).toBe(savedOffer.id);

    await service.prepareSupplierConfirmation(projectId, organizationId, {
      productName: "naočare za čitanje",
      result: { ...result, productUrl, supplierName: "History Eyewear Co., Ltd." },
    });
    await service.markSupplierConfirmationSent(projectId, organizationId, productUrl);
    await service.saveSupplierConfirmationReply(projectId, organizationId, {
      productUrl,
      responseNote: "Updated written price.",
      writtenQuote: "Unit price USD 1.05 for 1000 pcs. MOQ 100. FOB Ningbo.",
    });
    await service.confirmSupplierConfirmationTerm(projectId, organizationId, {
      productUrl,
      termKey: "UNIT_PRICE",
    });
    const transferred = await service.transferSupplierConfirmationToOffer(
      projectId,
      organizationId,
      productUrl,
    );
    expect(transferred.offerId).toBe(savedOffer.id);

    const storedCalculations = await prisma.costCalculation.findMany({
      where: { offerId: savedOffer.id, organizationId },
      orderBy: { createdAt: "asc" },
    });
    expect(storedCalculations.map((item) => item.id)).toContain(historical.id);
    expect(Number(storedCalculations[0]?.unitPrice)).toBe(0.7);
    const project = await projectService.getProject(projectId, organizationId);
    const visibleOffer = project?.offers.find((offer) => offer.id === savedOffer.id);
    expect(visibleOffer?.costCalculations).toHaveLength(0);
    expect(visibleOffer?.calculationSuperseded).toBe(true);
    const latestDecision = await decisionService.getLatestProjectDecision(projectId, organizationId);
    expect(latestDecision?.id).toBe(decision.id);
    expect(decisionRemainsCurrent(latestDecision, project?.offers ?? [])).toBe(false);

    const replacement = await costService.createCostCalculation(savedOffer.id, organizationId, {
      shippingCost: "50.00",
      customsDutyRate: "0",
      vatRate: "19",
      storageCost: "0",
      inspectionCost: "0",
      otherCosts: "0",
      targetSellingPrice: "5.00",
      calculationStatus: CalculationStatus.CALCULATED,
    });
    const historyAfterReplacement = await prisma.costCalculation.findMany({
      where: { offerId: savedOffer.id, organizationId },
    });
    expect(historyAfterReplacement).toHaveLength(2);
    const refreshed = await projectService.getProject(projectId, organizationId);
    const currentOffer = refreshed?.offers.find((offer) => offer.id === savedOffer.id);
    expect(currentOffer?.costCalculations).toHaveLength(1);
    expect(currentOffer?.costCalculations[0]?.id).toBe(replacement.id);
    expect(Number(currentOffer?.costCalculations[0]?.unitPrice)).toBe(1.05);
    expect(currentOffer?.calculationSuperseded).toBe(false);
    const stillHistorical = await decisionService.getLatestProjectDecision(projectId, organizationId);
    expect(stillHistorical?.id).toBe(decision.id);
    expect(decisionRemainsCurrent(stillHistorical, refreshed?.offers ?? [])).toBe(false);
  });
});
