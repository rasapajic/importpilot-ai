import { createHash } from "node:crypto";

import {
  OfferExtractionStatus,
  ProjectActivityType,
  SupplierOfferSource,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { recordAiUsageEvents } from "@/modules/ai-usage/application/ai-usage-service";
import { prisma } from "@/lib/database/prisma";
import { offerPriceChanged } from "@/modules/cost-engine/domain/current-calculation";
import {
  applyConfirmationState,
  buildSupplierConfirmationBrief,
  calculationSupersededAt,
  confirmSupplierTerm,
  confirmedCalculationInput,
  createPreparedConfirmation,
  markInquirySent,
  quotedPriceCoversRequestedQuantity,
  saveSupplierReply,
  type ConfirmableSupplierTermKey,
  type SupplierConfirmationBrief,
  type SupplierConfirmationRecord,
  type SupplierTermProposal,
} from "@/modules/negotiation/domain/supplier-confirmation";
import {
  isInternetDomainName,
  outboundTranslationRendersTargetLanguage,
  replyMentionsSupply,
  supplierFollowUpQuestions,
  translationPreservesCommercialFacts,
  type SupplierMessageLanguage,
} from "@/modules/negotiation/domain/supplier-message";
import {
  createOpenAiSupplierMessageTranslator,
  SupplierMessageTranslationFailedError,
  SupplierMessageTranslationNotConfiguredError,
  SupplierMessageTranslationTimeoutError,
  type SupplierMessageTranslator,
} from "@/modules/negotiation/infrastructure/openai-supplier-message-translator";

export {
  SupplierMessageTranslationFailedError,
  SupplierMessageTranslationNotConfiguredError,
  SupplierMessageTranslationTimeoutError,
};

import { supplierOfferSearchResultSchema } from "@/modules/product-search/domain/search";
import { createSupplierOfferSourceMetadata } from "@/modules/product-search/domain/source-provenance";
import { canonicalSupplierProductUrl } from "@/modules/product-search/domain/supplier-product-url";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

export class SupplierMessageFactError extends Error {
  constructor(readonly missing: string[]) {
    super("Translation omitted commercial facts.");
  }
}

const proposalSchema = z.object({
  key: z.enum([
    "UNIT_PRICE",
    "ORDER_QUANTITY",
    "MOQ",
    "INCOTERM",
    "LEAD_TIME_DAYS",
    "DIOPTERS",
    "VARIANT_MIXING",
  ]),
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
  sourceMessage: string;
  targetLanguage: string | null;
  translatedMessage: string;
  translationInputHash: string | null;
  supplierReplyOriginal: string;
  supplierReplyTranslation: string;
  replyTranslationHash: string | null;
  sourceResult: Prisma.JsonValue;
  proposals: Prisma.JsonValue;
};

export type SupplierMessageCommunication = {
  sourceMessage: string;
  targetLanguage: SupplierMessageLanguage | null;
  translatedMessage: string;
  translationCurrent: boolean;
  supplierReplyOriginal: string;
  supplierReplyTranslation: string;
  replyTranslationCurrent: boolean;
  followUpQuestions: string[];
  translationReused: boolean;
  estimatedCostUsd: string | null;
};

export type SupplierConfirmationView = {
  id: string;
  offerId: string | null;
  productUrl: string;
  subject: string;
  body: string;
  record: SupplierConfirmationRecord;
  communication: SupplierMessageCommunication;
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

const messageLanguages = new Set<SupplierMessageLanguage>(["EN", "ZH", "EN_ZH"]);

function isMessageLanguage(value: string | null): value is SupplierMessageLanguage {
  return value !== null && messageLanguages.has(value as SupplierMessageLanguage);
}

function translationHash(language: string, text: string) {
  return createHash("sha256").update(`${language}\n${text.trim()}`).digest("hex");
}

function proposalValue(record: SupplierConfirmationRecord, key: ConfirmableSupplierTermKey) {
  return record.proposals.find((item) => item.key === key) ?? null;
}

function communicationFor(
  row: ConfirmationRow,
  brief: SupplierConfirmationBrief,
  record: SupplierConfirmationRecord,
  meta: { translationReused?: boolean; estimatedCostUsd?: string | null } = {},
): SupplierMessageCommunication {
  const sourceMessage = row.sourceMessage.trim() || brief.serbianBody;
  const language = isMessageLanguage(row.targetLanguage) ? row.targetLanguage : null;
  const replyOriginal = row.supplierReplyOriginal.trim() || record.writtenQuote;
  const moq = proposalValue(record, "MOQ");
  const moqValue = moq ? Number(moq.value) : null;
  return {
    sourceMessage,
    targetLanguage: language,
    translatedMessage: row.translatedMessage,
    translationCurrent: Boolean(
      language &&
      row.translatedMessage.trim() &&
      row.translationInputHash === translationHash(language, sourceMessage),
    ),
    supplierReplyOriginal: replyOriginal,
    supplierReplyTranslation: row.supplierReplyTranslation,
    replyTranslationCurrent: Boolean(
      row.supplierReplyTranslation.trim() &&
      replyOriginal.trim() &&
      row.replyTranslationHash === translationHash("SR", replyOriginal),
    ),
    followUpQuestions: supplierFollowUpQuestions({
      replySaved: replyOriginal.trim().length > 0,
      readingGlasses: brief.readingGlasses,
      priceStated: proposalValue(record, "UNIT_PRICE") !== null,
      priceCoversQuantity: quotedPriceCoversRequestedQuantity(replyOriginal, brief.quantity),
      moqStated: moq !== null,
      moqTooHigh: moqValue !== null && brief.quantity !== null && moqValue > brief.quantity,
      mixingStated: proposalValue(record, "VARIANT_MIXING") !== null,
      incotermStated: proposalValue(record, "INCOTERM") !== null,
      leadTimeStated: proposalValue(record, "LEAD_TIME_DAYS") !== null,
      mentionsSupply: replyMentionsSupply(replyOriginal),
    }),
    translationReused: meta.translationReused === true,
    estimatedCostUsd: meta.estimatedCostUsd ?? null,
  };
}

function present(
  row: ConfirmationRow,
  project: { quantity: number; targetCountry: string },
  meta: { translationReused?: boolean; estimatedCostUsd?: string | null } = {},
): SupplierConfirmationView {
  const brief = briefFor(row, project);
  const record = applyConfirmationState(recordFrom(row), brief);
  return {
    id: row.id,
    offerId: row.offerId,
    productUrl: row.productUrl,
    subject: row.subject,
    body: row.body,
    record,
    communication: communicationFor(row, brief, record, meta),
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
      sourceMessage: brief.serbianBody,
      targetLanguage: null,
      translatedMessage: "",
      translationInputHash: null,
      supplierReplyOriginal: "",
      supplierReplyTranslation: "",
      replyTranslationHash: null,
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
  // A Gmail attempt must never be overwritten with a manual "sent" flag.
  // PENDING/UNCERTAIN delivery requires explicit provider reconciliation.
  const existingMail = await prisma.supplierMailDelivery.findUnique({
    where: {
      organizationId_confirmationId: {
        organizationId,
        confirmationId: row.id,
      },
    },
    select: { id: true },
  });
  if (existingMail) throw new SupplierConfirmationStateError();
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
  const original = next.writtenQuote.trim();
  const previousOriginal = row.supplierReplyOriginal.trim() || row.writtenQuote.trim();
  const saved = await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: {
      supplierReplyOriginal: original,
      ...(original !== previousOriginal ? { replyTranslationHash: null } : {}),
    },
  });
  return present(saved, project);
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

  let calculationSupersededAtValue = calculationSupersededAt(existing?.sourceMetadata);
  if (existing && offerPriceChanged(existing, confirmed)) {
    const [calculationCount, decisionCount] = await Promise.all([
      prisma.costCalculation.count({ where: { offerId: existing.id, organizationId } }),
      prisma.projectDecision.count({
        where: { selectedOfferId: existing.id, projectId, organizationId },
      }),
    ]);
    if (calculationCount > 0 || decisionCount > 0) {
      calculationSupersededAtValue = new Date().toISOString();
    }
  }
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
    ...(calculationSupersededAtValue
      ? { calculationSupersededAt: calculationSupersededAtValue }
      : {}),
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

function protectedLiterals(brief: SupplierConfirmationBrief, source: string) {
  return [brief.supplierName, brief.model ?? ""]
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && source.includes(item) && !isInternetDomainName(item));
}

async function translateChecked(input: {
  text: string;
  target: SupplierMessageLanguage;
  direction: "outbound" | "reply";
  literals: string[];
  translator: SupplierMessageTranslator;
  organizationId: string;
  projectId: string;
}) {
  const targets = input.direction === "outbound" && input.target === "EN_ZH"
    ? (["EN", "ZH"] as const)
    : ([input.target] as const);
  const settled = await Promise.allSettled(targets.map((target) => input.translator.translate({
    text: input.text,
    target,
    direction: input.direction,
  })));
  const fulfilled = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (fulfilled.length > 0) {
    await recordAiUsageEvents({
      organizationId: input.organizationId,
      projectId: input.projectId,
      events: fulfilled.map((item) => item.usage),
    });
  }
  const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) {
    const timeout = settled.find((result) =>
      result.status === "rejected" && result.reason instanceof SupplierMessageTranslationTimeoutError,
    );
    throw timeout && timeout.status === "rejected" ? timeout.reason : failure.reason;
  }
  const text = fulfilled.map((item) => item.text.trim()).join("\n---\n");
  const facts = translationPreservesCommercialFacts(input.text, text, {
    literals: input.literals,
    minimumCopies: input.direction === "outbound" && input.target === "EN_ZH" ? 2 : 1,
  });
  if (!facts.preserved) throw new SupplierMessageFactError(facts.missing);
  if (input.direction === "outbound") {
    const rendered = outboundTranslationRendersTargetLanguage(input.text, text, input.target);
    if (!rendered.complete) throw new SupplierMessageFactError(rendered.problems);
  }
  return {
    text,
    estimatedCostUsd: fulfilled
      .reduce((sum, item) => sum + item.usage.estimatedTotalCostUsd, 0)
      .toFixed(6),
  };
}

export async function saveSupplierSourceMessage(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; sourceMessage: string },
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const sourceMessage = input.sourceMessage.trim();
  if (!sourceMessage) throw new SupplierConfirmationStateError();
  const brief = briefFor(row, project);
  const currentSource = row.sourceMessage.trim() || brief.serbianBody;
  const changed = sourceMessage !== currentSource;
  const saved = await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: {
      sourceMessage,
      ...(changed ? { translationInputHash: null } : {}),
    },
  });
  return present(saved, project);
}

export async function translateSupplierInquiry(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; sourceMessage: string; targetLanguage: SupplierMessageLanguage },
  translator: SupplierMessageTranslator = createOpenAiSupplierMessageTranslator(),
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const sourceMessage = input.sourceMessage.trim();
  if (!sourceMessage || !isMessageLanguage(input.targetLanguage)) {
    throw new SupplierConfirmationStateError();
  }
  const brief = briefFor(row, project);
  const hash = translationHash(input.targetLanguage, sourceMessage);
  if (
    row.translationInputHash === hash &&
    row.translatedMessage.trim() &&
    row.targetLanguage === input.targetLanguage
  ) {
    const saved = sourceMessage === row.sourceMessage
      ? row
      : await prisma.supplierConfirmation.update({
        where: { id: row.id },
        data: { sourceMessage },
      });
    return present(saved, project, { translationReused: true, estimatedCostUsd: null });
  }

  const currentSource = row.sourceMessage.trim() || brief.serbianBody;
  const sourceChanged = sourceMessage !== currentSource;
  if (sourceChanged || sourceMessage !== row.sourceMessage) {
    await prisma.supplierConfirmation.update({
      where: { id: row.id },
      data: {
        sourceMessage,
        ...(sourceChanged ? { translationInputHash: null } : {}),
      },
    });
  }
  const translated = await translateChecked({
    text: sourceMessage,
    target: input.targetLanguage,
    direction: "outbound",
    literals: protectedLiterals(brief, sourceMessage),
    translator,
    organizationId,
    projectId,
  });
  const saved = await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: {
      sourceMessage,
      targetLanguage: input.targetLanguage,
      translatedMessage: translated.text,
      translationInputHash: hash,
    },
  });
  return present(saved, project, {
    translationReused: false,
    estimatedCostUsd: translated.estimatedCostUsd,
  });
}

export async function saveSupplierTranslatedMessage(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; translatedMessage: string },
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const translatedMessage = input.translatedMessage.trim();
  if (!translatedMessage || !row.translatedMessage.trim()) throw new SupplierConfirmationStateError();
  const brief = briefFor(row, project);
  const source = row.sourceMessage.trim() || brief.serbianBody;
  const facts = translationPreservesCommercialFacts(
    source,
    translatedMessage,
    {
      literals: protectedLiterals(brief, source),
      minimumCopies: row.targetLanguage === "EN_ZH" ? 2 : 1,
    },
  );
  if (!facts.preserved) throw new SupplierMessageFactError(facts.missing);
  if (isMessageLanguage(row.targetLanguage)) {
    const rendered = outboundTranslationRendersTargetLanguage(
      source,
      translatedMessage,
      row.targetLanguage,
    );
    if (!rendered.complete) throw new SupplierMessageFactError(rendered.problems);
  }
  const saved = await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: { translatedMessage },
  });
  return present(saved, project);
}

export async function translateSupplierReply(
  projectId: string,
  organizationId: string,
  input: { productUrl: string; responseNote: string; writtenQuote: string },
  translator: SupplierMessageTranslator = createOpenAiSupplierMessageTranslator(),
) {
  const { project, row } = await findConfirmation(projectId, organizationId, input.productUrl);
  const current = present(row, project);
  const received = saveSupplierReply(current.record, briefFor(row, project), input);
  if (received === current.record) throw new SupplierConfirmationStateError();
  const original = received.writtenQuote.trim();
  const brief = briefFor(row, project);
  const hash = translationHash("SR", original);
  if (
    row.replyTranslationHash === hash &&
    row.supplierReplyTranslation.trim() &&
    row.writtenQuote.trim() === original
  ) {
    const saved = row.responseNote === received.responseNote
      ? row
      : await prisma.supplierConfirmation.update({
        where: { id: row.id },
        data: { responseNote: received.responseNote },
      });
    return present(saved, project, { translationReused: true, estimatedCostUsd: null });
  }

  await saveRecord(row.id, received);
  await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: { supplierReplyOriginal: original },
  });
  const translated = await translateChecked({
    text: original,
    target: "EN",
    direction: "reply",
    literals: protectedLiterals(brief, original),
    translator,
    organizationId,
    projectId,
  });
  const saved = await prisma.supplierConfirmation.update({
    where: { id: row.id },
    data: {
      supplierReplyOriginal: original,
      supplierReplyTranslation: translated.text,
      replyTranslationHash: hash,
    },
  });
  return present(saved, project, {
    translationReused: false,
    estimatedCostUsd: translated.estimatedCostUsd,
  });
}
