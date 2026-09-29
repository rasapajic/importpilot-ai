import { CalculationStatus, OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CostEvidenceStatuses, VatTreatments } from "../../modules/cost-engine/domain/cost-evidence";

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
        contactEmail: "sales@cost.example",
        moq: 100,
        unitPrice: 10,
        currency: "EUR",
        incoterm: "FOB",
        sourceMetadata: {
          b2bPriceConfirmed: true,
          availabilityConfirmed: true,
          customsProvenance: {
            sourceName: "TARIC",
            officialUrl: "https://taxation-customs.ec.europa.eu/taric",
            checkedAt: "2026-09-25",
            tariffCode: "85044095",
            originCountry: "CN",
            shippingCountry: "CN",
            confirmedByOfficialSource: true,
          },
        },
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
    const calculation = await service.createCostCalculation(offerId, organizationId, completeRequest());
    expect(calculation.landedCostTotal?.toString()).toBe("1452");
  });

  it("does not expose an offer across tenants", async () => {
    await expect(
      service.createCostCalculation(offerId, otherOrganizationId, completeRequest()),
    ).rejects.toBeInstanceOf(service.CostOfferNotFoundError);
  });

  it("keeps calculation history and assessment uses the latest calculation", async () => {
    const previousCount = await prisma.costCalculation.count({ where: { offerId } });
    const latest = await service.createCostCalculation(offerId, organizationId, completeRequest({
      shippingCost: "250",
      customsDutyRate: "7",
      vatRate: "19",
      storageCost: "40",
      inspectionCost: "25",
      otherCosts: "15",
      targetSellingPrice: "24",
    }));
    expect(await prisma.costCalculation.count({ where: { offerId } })).toBe(previousCount + 1);

    const intelligence = await import("@/modules/intelligence/application/assessment-service");
    const assessment = await intelligence.assessSupplierOffer(offerId, organizationId);
    expect(assessment.costCalculationId).toBe(latest.id);
  });

  it("persists the selected transport context and restores an estimated status after refresh", async () => {
    const calculation = await service.createCostCalculation(offerId, organizationId, {
      ...completeRequest(),
      shippingCost: "225",
      shippingStatus: CostEvidenceStatuses.ESTIMATED,
      shippingEstimate: {
        mode: "SEA",
        confidence: "HIGH",
        estimatedWeightKg: 300,
        estimatedVolumeCbm: 1.2,
        sizeOption: "BOOK",
        weightOption: "G_100_500",
      },
    });
    const formValues = (await import("@/modules/cost-engine/application/calculation-form-values"))
      .getCalculationFormValues(calculation);

    expect(calculation.calculationStatus).toBe(CalculationStatus.NEEDS_REVIEW);
    expect(formValues.shippingStatus).toBe(CostEvidenceStatuses.ESTIMATED);
    expect(formValues.shippingCost).toBe("225");
    expect(formValues.shippingEstimate).toEqual({
      mode: "SEA",
      confidence: "HIGH",
      estimatedWeightKg: 300,
      estimatedVolumeCbm: 1.2,
      sizeOption: "BOOK",
      weightOption: "G_100_500",
    });
  });
});
  function completeRequest(overrides: Record<string, string> = {}) {
    return {
      shippingCost: "100.00",
      shippingStatus: CostEvidenceStatuses.CONFIRMED,
      insuranceCost: null,
      insuranceStatus: CostEvidenceStatuses.NOT_APPLICABLE,
      customsDutyRate: "5",
      customsDutyStatus: CostEvidenceStatuses.CONFIRMED,
      vatRate: "20",
      vatStatus: CostEvidenceStatuses.CONFIRMED,
      freightForwardingCost: null,
      freightForwardingStatus: CostEvidenceStatuses.NOT_APPLICABLE,
      storageCost: "30.00",
      storageStatus: CostEvidenceStatuses.CONFIRMED,
      inspectionCost: "20.00",
      inspectionStatus: CostEvidenceStatuses.CONFIRMED,
      otherCosts: "10.00",
      otherStatus: CostEvidenceStatuses.CONFIRMED,
      targetSellingPrice: "20.00",
      vatTreatment: VatTreatments.COST,
      calculationStatus: CalculationStatus.CALCULATED,
      ...overrides,
    };
  }
