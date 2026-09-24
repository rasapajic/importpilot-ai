import {
  CalculationStatus,
  OfferExtractionStatus,
  ProjectActivityType,
  ProjectStatus,
  SupplierOfferSource,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/database/prisma";
import { normalizeSupplierSearchQuery } from "../modules/product-search/infrastructure/persistent-cache";
import {
  assertJakov360AcceptanceSeedAllowed,
  buildJakov360AcceptanceSeedPlan,
  JAKOV360_ACCEPTANCE_PROJECT_ID,
  JAKOV360_DEMO_EMAIL,
  JAKOV360_DEMO_ORGANIZATION_ID,
} from "./jakov360-acceptance-fixture";

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const database = assertJakov360AcceptanceSeedAllowed({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    explicitConfirmation: process.env.JAKOV360_ACCEPTANCE_SEED,
  });
  const plan = buildJakov360AcceptanceSeedPlan();
  const user = await prisma.user.findUnique({
    where: { email: JAKOV360_DEMO_EMAIL },
    include: {
      memberships: {
        where: { organizationId: JAKOV360_DEMO_ORGANIZATION_ID },
        take: 1,
      },
    },
  });
  if (!user || user.memberships.length === 0) {
    throw new Error("Local demo account is missing. Run npm run db:seed first.");
  }

  const existingProject = await prisma.importProject.findUnique({
    where: { id: JAKOV360_ACCEPTANCE_PROJECT_ID },
    select: { organizationId: true },
  });
  if (existingProject && existingProject.organizationId !== JAKOV360_DEMO_ORGANIZATION_ID) {
    throw new Error("Acceptance project ID is already owned by another organization.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.importProject.deleteMany({
      where: {
        id: plan.project.id,
        organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
      },
    });
    await transaction.importProject.create({
      data: {
        id: plan.project.id,
        organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
        createdById: user.id,
        name: plan.project.name,
        targetCountry: plan.project.targetCountry,
        quantity: plan.project.quantity,
        targetMargin: plan.project.targetMargin,
        status: ProjectStatus.COLLECTING_OFFERS,
      },
    });

    for (const offer of plan.offers) {
      await transaction.supplierOffer.create({
        data: {
          id: offer.id,
          organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
          projectId: plan.project.id,
          supplierName: offer.supplierName,
          supplierCountry: offer.supplierCountry,
          moq: offer.moq,
          unitPrice: offer.unitPrice,
          currency: offer.currency,
          incoterm: offer.incoterm,
          extractionStatus: OfferExtractionStatus.MANUAL,
          source: SupplierOfferSource.SEARCH_RESULT,
          sourceMetadata: jsonValue(offer.sourceMetadata),
        },
      });
    }

    await transaction.costCalculation.create({
      data: {
        id: plan.glassesCalculation.id,
        organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
        projectId: plan.project.id,
        offerId: plan.glassesOfferId,
        targetCountry: plan.glassesCalculation.targetCountry,
        quantity: plan.glassesCalculation.quantity,
        unitPrice: plan.glassesCalculation.unitPrice,
        currency: plan.glassesCalculation.currency,
        incoterm: plan.glassesCalculation.incoterm,
        shippingCost: plan.glassesCalculation.shippingCost,
        customsDutyRate: plan.glassesCalculation.customsDutyRate,
        customsDutyAmount: plan.glassesCalculation.customsDutyAmount,
        vatRate: plan.glassesCalculation.vatRate,
        vatAmount: plan.glassesCalculation.vatAmount,
        storageCost: plan.glassesCalculation.storageCost,
        inspectionCost: plan.glassesCalculation.inspectionCost,
        otherCosts: plan.glassesCalculation.otherCosts,
        landedCostTotal: plan.glassesCalculation.landedCostTotal,
        landedCostPerUnit: plan.glassesCalculation.landedCostPerUnit,
        targetSellingPrice: plan.glassesCalculation.targetSellingPrice,
        grossMarginPercent: plan.glassesCalculation.grossMarginPercent,
        breakEvenPrice: plan.glassesCalculation.breakEvenPrice,
        calculationStatus: CalculationStatus.NEEDS_REVIEW,
      },
    });

    await transaction.projectActivity.createMany({
      data: [
        {
          organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
          projectId: plan.project.id,
          type: ProjectActivityType.PROJECT_CREATED,
          title: "JAKOV360 lokalni acceptance projekat je kreiran",
        },
        {
          organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
          projectId: plan.project.id,
          type: ProjectActivityType.OFFER_ADDED,
          title: "Deterministički acceptance primeri su dodati",
        },
        {
          organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
          projectId: plan.project.id,
          type: ProjectActivityType.LANDED_COST_CALCULATED,
          title: "Kalkulacija naočara čeka potvrđene podatke",
        },
      ],
    });

    for (const cache of plan.searchCaches) {
      const normalizedQuery = normalizeSupplierSearchQuery(cache.query);
      const data = {
        query: cache.query,
        normalizedQuery,
        targetCountry: cache.targetCountry,
        quantity: cache.quantity,
        source: "JAKOV360 local acceptance fixture",
        resultsJson: jsonValue(cache.results),
        createdAt: new Date("2026-06-15T00:00:00.000Z"),
        expiresAt: new Date("2099-12-31T23:59:59.000Z"),
      };
      await transaction.supplierSearchCache.upsert({
        where: {
          normalizedQuery_targetCountry_quantity: {
            normalizedQuery,
            targetCountry: cache.targetCountry,
            quantity: cache.quantity,
          },
        },
        create: { id: cache.id, ...data },
        update: data,
      });
    }
  });

  const [offerCount, calculationCount] = await Promise.all([
    prisma.supplierOffer.count({ where: { projectId: plan.project.id } }),
    prisma.costCalculation.count({ where: { projectId: plan.project.id } }),
  ]);
  if (offerCount !== plan.offers.length || calculationCount !== 1) {
    throw new Error(`Acceptance seed verification failed: ${offerCount} offers, ${calculationCount} calculations.`);
  }

  console.info("JAKOV360 local acceptance seed created safely.");
  console.info(`Database: ${database.databaseHost}/${database.databaseName}`);
  console.info(`Project: http://localhost:3000/projects/${plan.project.id}`);
  console.info(`Login: ${JAKOV360_DEMO_EMAIL}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
