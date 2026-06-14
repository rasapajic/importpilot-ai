import {
  CalculationStatus,
  OfferExtractionStatus,
  OrganizationRole,
  ProjectActivityType,
  ProjectStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/database/prisma";
import { hashPassword } from "../modules/auth/infrastructure/password";
import { createSessionData } from "../modules/auth/infrastructure/session";
import { calculateLandedCost } from "../modules/cost-engine/domain/calculator";
import {
  createProjectDecision,
  type ProjectDecisionOffer,
} from "../modules/decisions/domain/project-decision";
import { assessOffer } from "../modules/intelligence/domain/scoring";

const email = "owner@tradepilot.local";
const password = "TradePilot-Dev-2026";
const organizationId = "00000000-0000-4000-8000-000000000001";

type DemoOffer = {
  supplierName: string;
  currency: string;
  unitPrice: string;
  moq: number;
  incoterm: string;
  deliveryTimeDays: number;
  supplierVerified: boolean;
  yearsOnPlatform: number;
  responseRatePercent: number;
  sampleAvailable: boolean;
  termsClarityScore: number;
  shippingClarityScore: number;
  shippingCost: string;
  targetSellingPrice: string;
};

type DemoProject = {
  name: string;
  quantity: number;
  targetMargin: number;
  offers: DemoOffer[];
};

const demos: DemoProject[] = [
  {
    name: "[DEMO] Električni čajnici — READY_TO_BUY",
    quantity: 500,
    targetMargin: 25,
    offers: [
      { supplierName: "Guangzhou HomeTech", currency: "EUR", unitPrice: "8.20", moq: 500, incoterm: "FOB", deliveryTimeDays: 24, supplierVerified: true, yearsOnPlatform: 9, responseRatePercent: 96, sampleAvailable: true, termsClarityScore: 95, shippingClarityScore: 92, shippingCost: "950", targetSellingPrice: "18" },
      { supplierName: "Ningbo Kitchen Works", currency: "EUR", unitPrice: "8.70", moq: 400, incoterm: "CIF", deliveryTimeDays: 28, supplierVerified: true, yearsOnPlatform: 7, responseRatePercent: 92, sampleAvailable: true, termsClarityScore: 90, shippingClarityScore: 90, shippingCost: "850", targetSellingPrice: "18" },
      { supplierName: "Shenzhen Daily Goods", currency: "EUR", unitPrice: "9.10", moq: 300, incoterm: "FOB", deliveryTimeDays: 30, supplierVerified: true, yearsOnPlatform: 6, responseRatePercent: 89, sampleAvailable: true, termsClarityScore: 88, shippingClarityScore: 85, shippingCost: "900", targetSellingPrice: "18" },
    ],
  },
  {
    name: "[DEMO] LED radne lampe — NEGOTIATE_FIRST / različite valute",
    quantity: 800,
    targetMargin: 30,
    offers: [
      { supplierName: "Bright Future Lighting", currency: "EUR", unitPrice: "5.40", moq: 1500, incoterm: "FOB", deliveryTimeDays: 32, supplierVerified: true, yearsOnPlatform: 5, responseRatePercent: 86, sampleAvailable: false, termsClarityScore: 68, shippingClarityScore: 55, shippingCost: "1200", targetSellingPrice: "13" },
      { supplierName: "Dongguan Light Factory", currency: "EUR", unitPrice: "5.90", moq: 1000, incoterm: "CIF", deliveryTimeDays: 35, supplierVerified: true, yearsOnPlatform: 4, responseRatePercent: 82, sampleAvailable: true, termsClarityScore: 72, shippingClarityScore: 65, shippingCost: "1100", targetSellingPrice: "13" },
      { supplierName: "Shenzhen Lumina", currency: "USD", unitPrice: "5.20", moq: 800, incoterm: "FOB", deliveryTimeDays: 29, supplierVerified: true, yearsOnPlatform: 6, responseRatePercent: 91, sampleAvailable: true, termsClarityScore: 80, shippingClarityScore: 78, shippingCost: "1300", targetSellingPrice: "14" },
    ],
  },
  {
    name: "[DEMO] Mini grejalice — DO_NOT_BUY",
    quantity: 400,
    targetMargin: 25,
    offers: [
      { supplierName: "Unknown Heat Trading", currency: "EUR", unitPrice: "13.50", moq: 1200, incoterm: "FOB", deliveryTimeDays: 55, supplierVerified: false, yearsOnPlatform: 1, responseRatePercent: 28, sampleAvailable: false, termsClarityScore: 30, shippingClarityScore: 25, shippingCost: "1800", targetSellingPrice: "14" },
      { supplierName: "Fast Warm Export", currency: "EUR", unitPrice: "14.20", moq: 1000, incoterm: "EXW", deliveryTimeDays: 60, supplierVerified: false, yearsOnPlatform: 1, responseRatePercent: 35, sampleAvailable: false, termsClarityScore: 35, shippingClarityScore: 20, shippingCost: "2100", targetSellingPrice: "14" },
      { supplierName: "Budget Appliance Hub", currency: "EUR", unitPrice: "15.00", moq: 800, incoterm: "FOB", deliveryTimeDays: 50, supplierVerified: false, yearsOnPlatform: 2, responseRatePercent: 40, sampleAvailable: false, termsClarityScore: 40, shippingClarityScore: 35, shippingCost: "1700", targetSellingPrice: "14" },
    ],
  },
];

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function createDemoProject(demo: DemoProject, userId: string) {
  const project = await prisma.importProject.create({
    data: {
      organizationId,
      createdById: userId,
      name: demo.name,
      targetCountry: "DE",
      quantity: demo.quantity,
      targetMargin: demo.targetMargin,
      status: ProjectStatus.READY,
    },
  });
  const decisionOffers: ProjectDecisionOffer[] = [];

  for (const input of demo.offers) {
    const offer = await prisma.supplierOffer.create({
      data: {
        organizationId,
        projectId: project.id,
        supplierName: input.supplierName,
        supplierCountry: "CN",
        moq: input.moq,
        unitPrice: input.unitPrice,
        currency: input.currency,
        incoterm: input.incoterm,
        deliveryTimeDays: input.deliveryTimeDays,
        extractionStatus: OfferExtractionStatus.MANUAL,
        supplierVerified: input.supplierVerified,
        yearsOnPlatform: input.yearsOnPlatform,
        responseRatePercent: input.responseRatePercent,
        sampleAvailable: input.sampleAvailable,
        termsClarityScore: input.termsClarityScore,
        shippingClarityScore: input.shippingClarityScore,
      },
    });
    const cost = calculateLandedCost({
      targetCountry: "DE",
      quantity: demo.quantity,
      unitPrice: input.unitPrice,
      currency: input.currency,
      incoterm: input.incoterm,
      shippingCost: input.shippingCost,
      customsDutyRate: "4.0000",
      vatRate: "19.0000",
      storageCost: "250.00",
      inspectionCost: "180.00",
      otherCosts: "120.00",
      targetSellingPrice: input.targetSellingPrice,
    });
    const calculation = await prisma.costCalculation.create({
      data: {
        organizationId,
        projectId: project.id,
        offerId: offer.id,
        ...cost,
        calculationStatus: CalculationStatus.CALCULATED,
      },
    });
    const assessment = assessOffer({
      offerId: offer.id,
      supplierName: offer.supplierName,
      supplierCountry: "CN",
      supplierVerified: input.supplierVerified,
      yearsOnPlatform: input.yearsOnPlatform,
      responseRatePercent: input.responseRatePercent,
      moq: input.moq,
      unitPrice: Number(input.unitPrice),
      currency: input.currency,
      incoterm: input.incoterm,
      deliveryTimeDays: input.deliveryTimeDays,
      sampleAvailable: input.sampleAvailable,
      termsClarityScore: input.termsClarityScore,
      shippingClarityScore: input.shippingClarityScore,
      projectQuantity: demo.quantity,
      projectTargetMargin: demo.targetMargin,
      landedCostPerUnit: Number(cost.landedCostPerUnit),
      grossMarginPercent: Number(cost.grossMarginPercent),
    }, {
      currency: input.currency,
      unitPrices: demo.offers.filter((item) => item.currency === input.currency).map((item) => Number(item.unitPrice)),
    });
    await prisma.offerAssessment.create({
      data: {
        organizationId,
        projectId: project.id,
        offerId: offer.id,
        costCalculationId: calculation.id,
        supplierRiskScore: assessment.supplierRiskScore,
        offerQualityScore: assessment.offerQualityScore,
        overallScore: assessment.overallScore,
        confidenceScore: assessment.confidenceScore,
        recommendationStatus: assessment.recommendationStatus,
        explanation: assessment.explanation,
        scoreBreakdown: jsonValue(assessment.scoreBreakdown),
        assessmentVersion: assessment.assessmentVersion,
      },
    });
    decisionOffers.push({
      offerId: offer.id,
      supplierName: offer.supplierName,
      currency: offer.currency,
      incoterm: offer.incoterm,
      moq: offer.moq,
      moqExceedsProjectQuantity: offer.moq !== null && offer.moq > demo.quantity,
      sampleAvailable: offer.sampleAvailable,
      shippingClarityScore: offer.shippingClarityScore,
      landedCostTotal: Number(cost.landedCostTotal),
      landedCostPerUnit: Number(cost.landedCostPerUnit),
      grossMarginPercent: Number(cost.grossMarginPercent),
      calculationNeedsReview: false,
      assessment: {
        overallScore: assessment.overallScore,
        supplierRiskScore: assessment.supplierRiskScore,
        confidenceScore: assessment.confidenceScore,
        recommendationStatus: assessment.recommendationStatus,
      },
    });
  }

  const decision = createProjectDecision(decisionOffers);
  const createdDecision = await prisma.projectDecision.create({
    data: {
      organizationId,
      projectId: project.id,
      selectedOfferId: decision.selectedOfferId,
      status: decision.status,
      decisionReason: decision.decisionReason,
      actionChecklist: jsonValue(decision.actionChecklist),
      summarySnapshot: jsonValue(decision.summarySnapshot),
      decisionVersion: decision.decisionVersion,
    },
  });
  const demoOutcome =
    decision.status === "READY_TO_BUY"
      ? "BOUGHT"
      : decision.status === "NEGOTIATE_FIRST"
        ? "NEGOTIATED"
        : "ABANDONED";
  await prisma.projectOutcome.create({
    data: {
      organizationId,
      projectId: project.id,
      outcome: demoOutcome,
      decisionStatus: decision.status,
      purchaseSuccessful: decision.status === "READY_TO_BUY",
      comment: "Demo outcome za prikaz recommendation accuracy metrike.",
    },
  });
  await prisma.recommendationFeedback.create({
    data: {
      organizationId,
      projectId: project.id,
      projectDecisionId: createdDecision.id,
      vote: "HELPFUL",
      comment: "Demo feedback zapis.",
    },
  });
  await prisma.importProject.update({
    where: { id: project.id },
    data: { completionStatus: "COMPLETED" },
  });
  await prisma.projectCompletionHistory.createMany({
    data: [
      { organizationId, projectId: project.id, status: "ACTIVE" },
      { organizationId, projectId: project.id, status: "DECIDED" },
      { organizationId, projectId: project.id, status: "COMPLETED" },
    ],
  });
  await prisma.projectActivity.createMany({
    data: [
      { organizationId, projectId: project.id, type: ProjectActivityType.PROJECT_CREATED, title: "Demo projekat je kreiran" },
      { organizationId, projectId: project.id, type: ProjectActivityType.OFFER_ADDED, title: "Tri demo ponude su dodate" },
      { organizationId, projectId: project.id, type: ProjectActivityType.LANDED_COST_CALCULATED, title: "Landed cost je izračunat za sve ponude" },
      { organizationId, projectId: project.id, type: ProjectActivityType.ASSESSMENT_COMPLETED, title: "Ponude su ocenjene" },
      { organizationId, projectId: project.id, type: ProjectActivityType.FINAL_DECISION_CREATED, title: "Finalna projektna odluka je kreirana", description: decision.status },
    ],
  });
  return decision.status;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed is disabled in production.");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Demo Owner", passwordHash },
    create: { email, name: "Demo Owner", passwordHash },
  });
  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: "TradePilot Demo Company" },
    create: { id: organizationId, name: "TradePilot Demo Company" },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { role: OrganizationRole.OWNER },
    create: { organizationId, userId: user.id, role: OrganizationRole.OWNER },
  });

  await prisma.importProject.deleteMany({
    where: { organizationId, name: { startsWith: "[DEMO]" } },
  });
  const statuses = [];
  for (const demo of demos) statuses.push(await createDemoProject(demo, user.id));
  const expectedStatuses = ["READY_TO_BUY", "NEGOTIATE_FIRST", "DO_NOT_BUY"];
  if (statuses.some((status, index) => status !== expectedStatuses[index])) {
    throw new Error(
      `Demo scenarios do not match expected decisions. Expected ${expectedStatuses.join(", ")}, received ${statuses.join(", ")}.`,
    );
  }

  const session = createSessionData(user.id, organizationId, {
    ipAddress: "127.0.0.1",
    userAgent: "TradePilot development seed",
  });
  await prisma.session.deleteMany({ where: { userId: user.id, userAgent: "TradePilot development seed" } });
  await prisma.session.create({ data: session.data });

  console.info("TradePilot demo seed created.");
  console.info(`Email: ${email}`);
  console.info(`Password: ${password}`);
  console.info(`Demo decisions: ${statuses.join(", ")}`);
  console.info(`Session cookie: ${session.token}`);
}

main().finally(() => prisma.$disconnect());
