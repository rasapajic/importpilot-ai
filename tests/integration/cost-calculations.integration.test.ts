import { CalculationStatus, OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("cost calculation tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/cost-engine/application/cost-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let offerId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/cost-engine/application/cost-service");
    const user = await prisma.user.create({
      data: { email: `cost-${crypto.randomUUID()}@example.test`, name: "Cost Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Cost Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Cost Org" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Cost Project",
        targetCountry: "DE",
        quantity: 100,
        targetMargin: 20,
      },
    });
    const offer = await prisma.supplierOffer.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        supplierName: "Cost Supplier",
        unitPrice: 10,
        currency: "EUR",
        incoterm: "FOB",
      },
    });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    offerId = offer.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("persists a calculated scenario for the active tenant", async () => {
    const calculation = await service.createCostCalculation(offerId, organizationId, {
      shippingCost: "100.00",
      chinaDomesticTransportCost: "0.00",
      internationalTransportCost: "0.00",
      insuranceCost: "0.00",
      customsBrokerCost: "0.00",
      customsDutyRate: "5",
      vatRate: "20",
      storageCost: "30.00",
      inspectionCost: "20.00",
      otherCosts: "10.00",
      targetSellingPrice: "20.00",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      calculationStatus: CalculationStatus.CALCULATED,
    });
    expect(calculation.landedCostTotal?.toString()).toBe("1452");
    expect(calculation.calculationStatus).toBe(CalculationStatus.CALCULATED);
    expect(Number(calculation.insuranceCost)).toBe(0);
    expect(calculation.freightForwardingCost).toBeNull();
    expect(calculation.vatTreatment).toBe("UNSURE");
  });

  it("does not confirm a calculation when a cost is omitted", async () => {
    const project = await prisma.importProject.findFirstOrThrow({
      where: { organizationId, name: "Cost Project" },
    });
    const freshOffer = await prisma.supplierOffer.create({
      data: {
        organizationId,
        projectId: project.id,
        supplierName: "Omitted Cost Supplier",
        unitPrice: 10,
        currency: "EUR",
        incoterm: "FOB",
      },
    });
    const calculation = await service.createCostCalculation(freshOffer.id, organizationId, {
      shippingCost: "100.00",
      customsDutyRate: "5",
      vatRate: "20",
      storageCost: "30.00",
      inspectionCost: "20.00",
      otherCosts: "10.00",
      targetSellingPrice: "20.00",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      calculationStatus: CalculationStatus.CALCULATED,
    });
    expect(calculation.calculationStatus).toBe(CalculationStatus.NEEDS_REVIEW);
    expect(calculation.landedCostTotal).toBeNull();
    expect(calculation.insuranceCost).toBeNull();
    expect(calculation.grossMarginPercent).toBeNull();
    expect(Number(calculation.shippingCost)).toBe(100);
  });

  it("keeps history and known insurance, freight, and cost evidence", async () => {
    const previousCount = await prisma.costCalculation.count({ where: { offerId } });
    const previous = await prisma.costCalculation.findFirstOrThrow({
      where: { offerId },
      orderBy: { createdAt: "desc" },
    });
    await prisma.costCalculation.update({
      where: { id: previous.id },
      data: {
        insuranceCost: "12.50",
        freightForwardingCost: "8.00",
        costEvidence: { source: "supplier-quote" },
      },
    });

    const recalculated = await service.createCostCalculation(offerId, organizationId, {
      shippingCost: "100.00",
      chinaDomesticTransportCost: "0.00",
      internationalTransportCost: "0.00",
      customsBrokerCost: "0.00",
      customsDutyRate: "5",
      vatRate: "20",
      storageCost: "30.00",
      inspectionCost: "20.00",
      otherCosts: "10.00",
      targetSellingPrice: "20.00",
      calculationStatus: CalculationStatus.CALCULATED,
    });

    expect(await prisma.costCalculation.count({ where: { offerId } })).toBe(previousCount + 1);
    expect(recalculated.id).not.toBe(previous.id);
    expect(Number(recalculated.insuranceCost)).toBe(12.5);
    expect(Number(recalculated.freightForwardingCost)).toBe(8);
    expect(recalculated.costEvidence).toEqual({ source: "supplier-quote" });
    expect(recalculated.calculationStatus).toBe(CalculationStatus.NEEDS_REVIEW);
    expect(recalculated.landedCostTotal).toBeNull();
    const storedPrevious = await prisma.costCalculation.findUniqueOrThrow({ where: { id: previous.id } });
    expect(Number(storedPrevious.insuranceCost)).toBe(12.5);
    expect(storedPrevious.costEvidence).toEqual({ source: "supplier-quote" });

    const withExplicitZero = await service.createCostCalculation(offerId, organizationId, {
      shippingCost: "100.00",
      chinaDomesticTransportCost: "0.00",
      internationalTransportCost: "0.00",
      insuranceCost: "0.00",
      customsBrokerCost: "0.00",
      customsDutyRate: "5",
      vatRate: "20",
      storageCost: "30.00",
      inspectionCost: "20.00",
      otherCosts: "10.00",
      targetSellingPrice: "20.00",
      calculationStatus: CalculationStatus.CALCULATED,
    });
    expect(Number(withExplicitZero.insuranceCost)).toBe(0);
    expect(Number(withExplicitZero.freightForwardingCost)).toBe(8);
    expect(withExplicitZero.costEvidence).toEqual({ source: "supplier-quote" });
    expect(withExplicitZero.landedCostTotal).not.toBeNull();
    expect(withExplicitZero.calculationStatus).toBe(CalculationStatus.NEEDS_REVIEW);
  });

  it("does not expose an offer across tenants", async () => {
    await expect(
      service.createCostCalculation(offerId, otherOrganizationId, {
        shippingCost: "0",
        customsDutyRate: "0",
        vatRate: "0",
        storageCost: "0",
        inspectionCost: "0",
        otherCosts: "0",
        targetSellingPrice: "20",
        calculationStatus: CalculationStatus.CALCULATED,
      }),
    ).rejects.toBeInstanceOf(service.CostOfferNotFoundError);
  });

  it("keeps calculation history and assessment uses the latest calculation", async () => {
    const previousCount = await prisma.costCalculation.count({ where: { offerId } });
    const latest = await service.createCostCalculation(offerId, organizationId, {
      shippingCost: "250",
      customsDutyRate: "7",
      vatRate: "19",
      storageCost: "40",
      inspectionCost: "25",
      otherCosts: "15",
      targetSellingPrice: "24",
      calculationStatus: CalculationStatus.CALCULATED,
    });
    expect(await prisma.costCalculation.count({ where: { offerId } })).toBe(previousCount + 1);

    const intelligence = await import("@/modules/intelligence/application/assessment-service");
    const assessment = await intelligence.assessSupplierOffer(offerId, organizationId);
    expect(assessment.costCalculationId).toBe(latest.id);
  });
});
