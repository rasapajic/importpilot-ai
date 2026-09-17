import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const migrationRows = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL',
  );
  const migrationCount = Number(migrationRows?.[0]?.count ?? 0);
  if (migrationCount < 16) {
    throw new Error(`Expected at least 16 applied migrations after restore, found ${migrationCount}.`);
  }

  const user = await prisma.user.findFirst({
    where: { name: "Backup Restore Drill User" },
  });
  if (!user || !user.email.startsWith("backup-drill-")) {
    throw new Error("Representative restored user is missing.");
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new Error("Representative restored OWNER membership is missing.");
  }

  const project = await prisma.importProject.findFirst({
    where: {
      organizationId: membership.organizationId,
      name: { startsWith: "Backup Restore Drill Project " },
    },
    include: {
      offers: { orderBy: { createdAt: "asc" } },
      costCalculations: { orderBy: { createdAt: "asc" } },
      projectDecisions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) throw new Error("Representative restored project is missing.");
  if (project.targetCountry !== "AT" || project.quantity !== 100) {
    throw new Error("Representative restored project values changed.");
  }
  if (project.offers.length !== 1) {
    throw new Error(`Expected one restored offer, found ${project.offers.length}.`);
  }
  if (project.costCalculations.length !== 1) {
    throw new Error(`Expected one restored calculation, found ${project.costCalculations.length}.`);
  }
  if (project.projectDecisions.length !== 1) {
    throw new Error(`Expected one restored decision, found ${project.projectDecisions.length}.`);
  }

  const offer = project.offers[0];
  const calculation = project.costCalculations[0];
  const decision = project.projectDecisions[0];

  if (offer.supplierName !== "Backup Drill Supplier" || offer.currency !== "EUR" || offer.incoterm !== "FOB") {
    throw new Error("Representative restored offer values changed.");
  }
  if (calculation.offerId !== offer.id || calculation.calculationStatus !== "CALCULATED") {
    throw new Error("Representative restored calculation is inconsistent with the restored offer.");
  }
  if (Number(calculation.landedCostPerUnit) !== 14.2 || Number(calculation.vatRate) !== 20) {
    throw new Error("Representative restored calculation numeric values changed.");
  }
  if (decision.selectedOfferId !== offer.id || decision.status !== "READY_TO_BUY") {
    throw new Error("Representative restored decision no longer points to the restored offer.");
  }

  console.log("IMPORTPILOT_BACKUP_RESTORE_VERIFY PASS");
  console.log(JSON.stringify({
    migrationCount,
    userId: user.id,
    organizationId: membership.organizationId,
    projectId: project.id,
    offerId: offer.id,
    calculationId: calculation.id,
    decisionId: decision.id,
    targetCountry: project.targetCountry,
    currency: offer.currency,
    landedCostPerUnit: Number(calculation.landedCostPerUnit),
    decisionStatus: decision.status,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
