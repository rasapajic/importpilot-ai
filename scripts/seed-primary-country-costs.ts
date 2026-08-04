import {
  CalculationStatus,
  OfferExtractionStatus,
  ProjectActivityType,
  ProjectStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/database/prisma";
import { PRIMARY_IMPORT_COUNTRY_CODES } from "../modules/cost-engine/domain/import-country-profiles";
import { buildPrimaryCountryDemoScenario } from "../modules/cost-engine/domain/primary-country-demo";

const DEMO_EMAIL = "owner@tradepilot.local";
const DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_PREFIX = "[DEMO][LANDED-COST]";

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function createScenario(countryCode: (typeof PRIMARY_IMPORT_COUNTRY_CODES)[number], userId: string) {
  const scenario = buildPrimaryCountryDemoScenario(countryCode);

  const project = await prisma.importProject.create({
    data: {
      organizationId: DEMO_ORGANIZATION_ID,
      createdById: userId,
      name: scenario.projectName,
      targetCountry: scenario.countryCode,
      quantity: scenario.quantity,
      targetMargin: scenario.targetMargin,
      status: ProjectStatus.ANALYZING,
    },
  });

  const offer = await prisma.supplierOffer.create({
    data: {
      organizationId: DEMO_ORGANIZATION_ID,
      projectId: project.id,
      supplierName: scenario.supplierName,
      supplierCountry: "CN",
      moq: scenario.quantity,
      unitPrice: scenario.unitPrice,
      currency: scenario.currency,
      incoterm: scenario.incoterm,
      extractionStatus: OfferExtractionStatus.MANUAL,
      supplierVerified: true,
      yearsOnPlatform: 8,
      responseRatePercent: 94,
      sampleAvailable: true,
      termsClarityScore: 90,
      shippingClarityScore: 88,
      sourceMetadata: jsonValue({
        demo: true,
        demoType: "PRIMARY_COUNTRY_LANDED_COST",
        targetCountry: scenario.countryCode,
      }),
    },
  });

  const {
    customsBrokerCost,
    otherCosts,
    ...persistedCalculation
  } = scenario.calculation;
  const calculation = await prisma.costCalculation.create({
    data: {
      organizationId: DEMO_ORGANIZATION_ID,
      projectId: project.id,
      offerId: offer.id,
      ...persistedCalculation,
      otherCosts: scenario.persistedOtherCosts,
      calculationStatus: CalculationStatus.CALCULATED,
    },
  });

  await prisma.projectCompletionHistory.create({
    data: {
      organizationId: DEMO_ORGANIZATION_ID,
      projectId: project.id,
      status: "ACTIVE",
    },
  });

  await prisma.projectActivity.createMany({
    data: [
      {
        organizationId: DEMO_ORGANIZATION_ID,
        projectId: project.id,
        type: ProjectActivityType.PROJECT_CREATED,
        title: `Demo projekat za ${scenario.countryCode} je kreiran`,
      },
      {
        organizationId: DEMO_ORGANIZATION_ID,
        projectId: project.id,
        type: ProjectActivityType.OFFER_ADDED,
        title: "Demo ponuda iz Kine je dodata",
        description: scenario.supplierName,
        metadata: jsonValue({ offerId: offer.id }),
      },
      {
        organizationId: DEMO_ORGANIZATION_ID,
        projectId: project.id,
        type: ProjectActivityType.LANDED_COST_CALCULATED,
        title: `Stvarna cena do magacina (${scenario.countryCode}) je izračunata`,
        description: scenario.supplierName,
        metadata: jsonValue({
          calculationId: calculation.id,
          offerId: offer.id,
          supplierName: scenario.supplierName,
          calculationStatus: calculation.calculationStatus,
          shippingCost: scenario.calculation.shippingCost,
          customsDutyRate: scenario.calculation.customsDutyRate,
          vatRate: scenario.calculation.vatRate,
          costAssumptions: scenario.assumptions,
        }),
      },
    ],
  });

  return {
    countryCode: scenario.countryCode,
    vatRate: scenario.vatRate,
    landedCostTotal: scenario.calculation.landedCostTotal,
    landedCostPerUnit: scenario.calculation.landedCostPerUnit,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development demo seed is disabled in production.");
  }

  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  const organization = await prisma.organization.findUnique({ where: { id: DEMO_ORGANIZATION_ID } });
  if (!user || !organization) {
    throw new Error("Run `npm run db:seed` before `npm run db:seed:country-costs`.");
  }

  await prisma.importProject.deleteMany({
    where: {
      organizationId: DEMO_ORGANIZATION_ID,
      name: { startsWith: DEMO_PREFIX },
    },
  });

  const summaries = [];
  for (const countryCode of PRIMARY_IMPORT_COUNTRY_CODES) {
    summaries.push(await createScenario(countryCode, user.id));
  }

  console.info("Primary-country landed-cost demos created.");
  for (const summary of summaries) {
    console.info(
      `${summary.countryCode}: VAT ${summary.vatRate}% · total ${summary.landedCostTotal} EUR · per unit ${summary.landedCostPerUnit} EUR`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
