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
    stagingSafetyConfirmation: process.env.JAKOV360_ACCEPTANCE_STAGING_SEED,
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

  const projectIds = plan.projects.map(({ project }) => project.id);
  const existingProjects = await prisma.importProject.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, organizationId: true },
  });
  if (existingProjects.some((project) => project.organizationId !== JAKOV360_DEMO_ORGANIZATION_ID)) {
    throw new Error("An acceptance project ID is already owned by another organization.");
  }

  await prisma.$transaction(async (transaction) => {
    // Delete/recreate makes reruns deterministic and removes browser-created histories.
    await transaction.importProject.deleteMany({
      where: {
        id: { in: projectIds },
        organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
      },
    });

    for (const fixture of plan.projects) {
      await transaction.importProject.create({
        data: {
          id: fixture.project.id,
          organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
          createdById: user.id,
          name: fixture.project.name,
          targetCountry: fixture.project.targetCountry,
          quantity: fixture.project.quantity,
          targetMargin: fixture.project.targetMargin,
          status: ProjectStatus.COLLECTING_OFFERS,
        },
      });

      for (const offer of fixture.offers) {
        await transaction.supplierOffer.create({
          data: {
            id: offer.id,
            organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
            projectId: fixture.project.id,
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

      for (const calculation of fixture.calculations) {
        await transaction.costCalculation.create({
          data: {
            id: calculation.id,
            organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
            projectId: fixture.project.id,
            offerId: calculation.offerId,
            targetCountry: calculation.targetCountry,
            quantity: calculation.quantity,
            unitPrice: calculation.unitPrice,
            currency: calculation.currency,
            incoterm: calculation.incoterm,
            shippingCost: calculation.shippingCost,
            insuranceCost: calculation.insuranceCost,
            customsDutyRate: calculation.customsDutyRate,
            customsDutyAmount: calculation.customsDutyAmount,
            vatRate: calculation.vatRate,
            vatAmount: calculation.vatAmount,
            freightForwardingCost: calculation.freightForwardingCost,
            storageCost: calculation.storageCost,
            inspectionCost: calculation.inspectionCost,
            otherCosts: calculation.otherCosts,
            knownCostTotal: calculation.knownCostTotal,
            landedCostTotal: calculation.landedCostTotal,
            landedCostPerUnit: calculation.landedCostPerUnit,
            targetSellingPrice: calculation.targetSellingPrice,
            grossMarginPercent: calculation.grossMarginPercent,
            breakEvenPrice: calculation.breakEvenPrice,
            requiredCashTotal: calculation.requiredCashTotal,
            netAcquisitionCost: calculation.netAcquisitionCost,
            vatTreatment: calculation.vatTreatment,
            costEvidence: jsonValue(calculation.costEvidence),
            calculationStatus: CalculationStatus.NEEDS_REVIEW,
          },
        });
      }

      await transaction.projectActivity.createMany({
        data: [
          {
            organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
            projectId: fixture.project.id,
            type: ProjectActivityType.PROJECT_CREATED,
            title: "JAKOV360 lokalni acceptance projekat je kreiran",
          },
          {
            organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
            projectId: fixture.project.id,
            type: ProjectActivityType.OFFER_ADDED,
            title: "Deterministički acceptance primeri su dodati",
          },
          ...(fixture.calculations.length > 0 ? [{
            organizationId: JAKOV360_DEMO_ORGANIZATION_ID,
            projectId: fixture.project.id,
            type: ProjectActivityType.LANDED_COST_CALCULATED,
            title: "Kalkulacija čeka potvrđene podatke",
          }] : []),
        ],
      });
    }

    await transaction.supplierSearchCache.deleteMany({
      where: {
        OR: [
          { id: { in: plan.searchCaches.map((cache) => cache.id) } },
          ...plan.searchCaches.map((cache) => ({
            normalizedQuery: normalizeSupplierSearchQuery(cache.query),
            targetCountry: cache.targetCountry,
            quantity: cache.quantity,
          })),
        ],
      },
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
      await transaction.supplierSearchCache.create({ data: { id: cache.id, ...data } });
    }
  });

  for (const fixture of plan.projects) {
    const [offerCount, calculationCount, assessmentCount, decisionCount] = await Promise.all([
      prisma.supplierOffer.count({ where: { projectId: fixture.project.id } }),
      prisma.costCalculation.count({ where: { projectId: fixture.project.id } }),
      prisma.offerAssessment.count({ where: { projectId: fixture.project.id } }),
      prisma.projectDecision.count({ where: { projectId: fixture.project.id } }),
    ]);
    if (
      offerCount !== fixture.offers.length ||
      calculationCount !== fixture.calculations.length ||
      assessmentCount !== 0 ||
      decisionCount !== 0
    ) {
      throw new Error(`Acceptance seed verification failed for ${fixture.project.name}.`);
    }
  }

  console.info("JAKOV360 local acceptance seed created safely.");
  console.info(`Database: ${database.databaseHost}/${database.databaseName}`);
  for (const fixture of plan.projects) {
    console.info(`Project: http://localhost:3000/projects/${fixture.project.id}`);
  }
  console.info(`Login: ${JAKOV360_DEMO_EMAIL}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
