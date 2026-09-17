import { randomUUID } from "node:crypto";
import {
  CalculationStatus,
  OrganizationRole,
  PrismaClient,
  ProjectDecisionStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const marker = `backup-drill-${randomUUID()}`;

try {
  const user = await prisma.user.create({
    data: {
      email: `${marker}@example.test`,
      name: "Backup Restore Drill User",
      passwordHash: null,
    },
  });
  const organization = await prisma.organization.create({
    data: { name: "Backup Restore Drill Organization" },
  });
  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: OrganizationRole.OWNER,
    },
  });
  const project = await prisma.importProject.create({
    data: {
      organizationId: organization.id,
      createdById: user.id,
      name: `Backup Restore Drill Project ${marker}`,
      targetCountry: "AT",
      quantity: 100,
      targetMargin: 20,
    },
  });
  const offer = await prisma.supplierOffer.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      supplierName: "Backup Drill Supplier",
      supplierCountry: "CN",
      moq: 100,
      unitPrice: 10,
      currency: "EUR",
      incoterm: "FOB",
    },
  });
  const calculation = await prisma.costCalculation.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      offerId: offer.id,
      targetCountry: "AT",
      quantity: 100,
      unitPrice: 10,
      currency: "EUR",
      incoterm: "FOB",
      shippingCost: 100,
      customsDutyRate: 5,
      customsDutyAmount: 50,
      vatRate: 20,
      vatAmount: 210,
      storageCost: 30,
      inspectionCost: 20,
      otherCosts: 10,
      landedCostTotal: 1420,
      landedCostPerUnit: 14.2,
      targetSellingPrice: 20,
      grossMarginPercent: 29,
      breakEvenPrice: 14.2,
      calculationStatus: CalculationStatus.CALCULATED,
    },
  });
  const decision = await prisma.projectDecision.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      selectedOfferId: offer.id,
      status: ProjectDecisionStatus.READY_TO_BUY,
      decisionReason: "Backup drill representative decision.",
      actionChecklist: [{ label: "Verify restore", completed: false }],
      summarySnapshot: {
        marker,
        calculationId: calculation.id,
        offerId: offer.id,
      },
      decisionVersion: "backup-drill-v1",
    },
  });

  console.log(JSON.stringify({
    marker,
    email: user.email,
    userId: user.id,
    organizationId: organization.id,
    projectId: project.id,
    offerId: offer.id,
    calculationId: calculation.id,
    decisionId: decision.id,
  }));
} finally {
  await prisma.$disconnect();
}
