import {
  OfferExtractionStatus,
  ProjectActivityType,
  SupplierOfferSource,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import {
  applyConfirmationState,
  buildSupplierConfirmationBrief,
  confirmSupplierTerm,
  confirmedCalculationInput,
  createPreparedConfirmation,
  markInquirySent,
  saveSupplierReply,
  type ConfirmableSupplierTermKey,
  type SupplierConfirmationRecord,
  type SupplierTermProposal,
} from "@/modules/negotiation/domain/supplier-confirmation";
import { supplierOfferSearchResultSchema } from "@/modules/product-search/domain/search";
import { createSupplierOfferSourceMetadata } from "@/modules/product-search/domain/source-provenance";
import { canonicalSupplierProductUrl } from "@/modules/product-search/domain/supplier-product-url";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

const proposalSchema = z.object({
  key: z.enum(["UNIT_PRICE", "ORDER_QUANTITY", "MOQ", "INCOTERM", "LEAD_TIME_DAYS", "DIOPTERS"]),
  value: z.string(),
  confirmed: z.boolean(),
  evidence: z.literal("WRITTEN_QUOTE"),
});

export class SupplierConfirmationProjectNotFoundError extends Error {}
export class SupplierConfirmationNotFoundError extends Error {}
export class SupplierConfirmationStateError extends Error {}

type ConfirmationRow = {
  id: string;
  offerId: string | null;
  productUrl: string;
  productName: string;
  status: SupplierConfirmationRecord["status"];
  subject: string;
  body: string;
  responseNote: string;
  writtenQuote: string;
  sourceResult: Prisma.JsonValue;
  proposals: Prisma.JsonValue;
};

export type SupplierConfirmationView = {
  id: string;
  offerId: string | null;
  productUrl: string;
  subject: string;
  body: string;
  record: SupplierConfirmationRecord;
};

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function proposalsFrom(value: Prisma.JsonValue): SupplierTermProposal[] {
  const parsed = z.array(proposalSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function recordFrom(row: ConfirmationRow): SupplierConfirmationRecord {
  return {
    ...createPreparedConfirmation(),
    status: row.status,
    responseNote: row.responseNote,
    writtenQuote: row.writtenQuote,
    proposals: proposalsFrom(row.proposals),
  };
}

async function projectContext(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, quantity: true, targetCountry: true },
  });
  if (!project) throw new SupplierConfirmationProjectNotFoundError();
  return project;
}

function briefFor(
  row: Pick<ConfirmationRow, "productName" | "sourceResult">,
  project: { quantity: number; targetCountry: string },
) {
  return buildSupplierConfirmationBrief({
    result: supplierOfferSearchResultSchema.parse(row.sourceResult),
    productName: row.productName,
    quantity: project.quantity,
    destination: project.targetCountry,
  });
}

function present(row: ConfirmationRow, project: { quantity: number; targetCountry: string }): SupplierConfirmationView {
  const brief = briefFor(row, project);
  return {
    id: row.id,
    offerId: row.offerId,
    productUrl: row.productUrl,
    subject: row.subject,
    body: row.body,
    record: applyConfirmationState(recordFrom(row), brief),
  };
}

async function findConfirmation(projectId: string, organizationId: string, productUrl: string) {
  const project = await projectContext(projectId, organizationId);
  const canonicalUrl = canonicalSupplierProductUrl(productUrl);
  const row = await prisma.supplierConfirmation.findUnique({
    where: {
      organizationId_projectId_productUrl: {
        organizationId,
        projectId,
        productUrl: canonicalUrl,
      },
    },
  });
  if (!row) throw new SupplierConfirmationNotFoundError();
  return { project, row };
}

async function saveRecord(id: string, record: SupplierConfirmationRecord) {
  await prisma.supplierConfirmation.update({
    where: { id },
    data: {
      status: record.status,
      responseNote: record.responseNote,
      writtenQuote: record.writtenQuote,
      proposals: jsonValue(record.proposals),
      supplierPriceConfirmed: record.supplierPriceConfirmed,
      quantityConfirmed: record.quantityConfirmed,
      moqConfirmed: record.moqConfirmed,
      variantsConfirmed: record.variantsConfirmed,
      orderTermsConfirmed: record.orderTermsConfirmed,
      transportConfirmed: false,
      customsConfirmed: false,
      vatConfirmed: false,
      otherCostsConfirmed: false,
      additionalConfirmationRequired: record.additionalConfirmationRequired,
    },
  });
}

export async function prepareSupplierConfirmation(
  projectId: string,
  organizationId: string,
  input: { productName: string; result: unknown },
) {
  const project = await projectContext(projectId, organizationId);
  const result = supplierOfferSearchResultSchema.parse(input.result);
  const productUrl = canonicalSupplierProductUrl(result.productUrl);
  const existing = await prisma.supplierConfirmation.findUnique({
    where: {
      organizationId_projectId_productUrl: { organizationId, projectId, productUrl },
    },
  });
  if (existing) return present(existing, project);

  const brief = buildSupplierConfirmationBrief({
    result,
    productName: input.productName.trim(),
    quantity: project.quantity,
    destination: project.targetCountry,
  });
  const prepared = createPreparedConfirmation();
  const row = await prisma.supplierConfirmation.create({
    data: {
      organizationId,
      projectId,
      productUrl,
      productName: brief.productName.slice(0, 300),
      status: prepared.status,
      subject: brief.subject.slice(0, 500),
      body: brief.body,
      responseNote: "",
      writtenQuote: "",
      sourceResult: jsonValue(result),
      proposals: [],
      supplierPriceConfirmed: false,
      quantityConfirmed: false,
      moqConfirmed: false,
      variantsConfirmed: false,
      orderTermsConfirmed: false,
      transportConfirmed: false,
      customsConfirmed: false,
      vatConfirmed: false,
      otherCostsConfirmed: false,
      additionalConfirmationRequired: false,
    },
  });
  return present(row, project);
}

export async function getSupplierConfirmation(
  projectId: string,
  organizationId: string,
  productUrl: string,
) {
  const { project, row } = await findConfirmation(projectId, organizationId, productUrl);
  return present(row, project);
}

export async function markSupplierConfirmationSent(
  projectId: string,
  organizationId: string,
  productUrl: string,
) {
  const { project, row } = await findConfirmation(projectId, organizationId, productUrl);
  const current = present(row, project);
  const next = markInquirySent(current.record);
  if (next.status === current.record.status) return current;
  await saveRecord(row.id, next);
  return { ...current, record: next };
}

export async function saveSupplierConfirmationReply(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; responseNote: string; writtenQuote: string },
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const current = present(row, project);
  const next = saveSupplierReply(current.record, briefFor(row, project), input);
  if (next === current.record) throw new SupplierConfirmationStateError();
  await saveRecord(row.id, next);
  return { ...current, record: next };
}

export async function confirmSupplierConfirmationTerm(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; termKey: ConfirmableSupplierTermKey },
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const current = present(row, project);
  const next = confirmSupplierTerm(current.record, briefFor(row, project), input.termKey);
  if (next === current.record) throw new SupplierConfirmationStateError();
  await saveRecord(row.id, next);
  return { ...current, record: next };
}

export async function transferSupplierConfirmationToOffer(
  projectId: string,
  organizationId: string,
  productUrl: string,
) {
  const { project, row } = await findConfirmation(projectId, organizationId, productUrl);
  const current = present(row, project);
  const confirmed = confirmedCalculationInput(current.record);
  if (!confirmed) throw new SupplierConfirmationStateError();
  const result = supplierOfferSearchResultSchema.parse(row.sourceResult);
  const canonicalUrl = canonicalSupplierProductUrl(result.productUrl);
  const offers = await prisma.supplierOffer.findMany({
    where: { organizationId, projectId, source: SupplierOfferSource.SEARCH_RESULT },
  });
  const existing = offers.find((offer) => {
    const metadata = offer.sourceMetadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const storedUrl = (metadata as { productUrl?: unknown }).productUrl;
    return typeof storedUrl === "string" && canonicalSupplierProductUrl(storedUrl) === canonicalUrl;
  }) ?? null;

  const supplierConfirmation = {
    supplierPriceConfirmed: current.record.supplierPriceConfirmed,
    quantityConfirmed: current.record.quantityConfirmed,
    moqConfirmed: current.record.moqConfirmed,
    variantsConfirmed: current.record.variantsConfirmed,
    orderTermsConfirmed: current.record.orderTermsConfirmed,
    transportConfirmed: false,
    customsConfirmed: false,
    vatConfirmed: false,
    otherCostsConfirmed: false,
  };
  const baseMetadata = existing?.sourceMetadata && typeof existing.sourceMetadata === "object"
    ? existing.sourceMetadata as Record<string, unknown>
    : createSupplierOfferSourceMetadata(result);
  const sourceMetadata = jsonValue({ ...baseMetadata, supplierConfirmation });
  const commercialData = {
    unitPrice: confirmed.unitPrice,
    currency: confirmed.currency,
    ...(confirmed.incoterm ? { incoterm: confirmed.incoterm } : {}),
    ...(confirmed.moq !== null ? { moq: confirmed.moq } : {}),
    ...(confirmed.deliveryTimeDays !== null ? { deliveryTimeDays: confirmed.deliveryTimeDays } : {}),
    rawExtractedText: current.record.writtenQuote,
    extractionStatus: OfferExtractionStatus.REVIEWED,
    sourceMetadata,
  };

  const offer = await prisma.$transaction(async (transaction) => {
    const saved = existing
      ? await transaction.supplierOffer.update({
          where: { id: existing.id },
          data: commercialData,
        })
      : await transaction.supplierOffer.create({
          data: {
            organizationId,
            projectId,
            supplierName: result.supplierName,
            supplierCountry: result.supplierCountry,
            source: SupplierOfferSource.SEARCH_RESULT,
            ...commercialData,
          },
        });
    await transaction.supplierConfirmation.update({
      where: { id: row.id },
      data: { offerId: saved.id },
    });
    if (!existing) {
      await recordProjectActivity(transaction, {
        organizationId,
        projectId,
        type: ProjectActivityType.OFFER_ADDED,
        title: "Potvrđena cena dobavljača je preneta u obračun",
        description: saved.supplierName,
        metadata: {
          offerId: saved.id,
          confirmationId: row.id,
          supplierPriceConfirmed: true,
          orderTermsConfirmed: current.record.orderTermsConfirmed,
          transportConfirmed: false,
          customsConfirmed: false,
          vatConfirmed: false,
          otherCostsConfirmed: false,
        },
      });
    }
    return saved;
  });

  return { ...current, offerId: offer.id };
}
