import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  confirmSupplierConfirmationTerm,
  getSupplierConfirmation,
  markSupplierConfirmationSent,
  prepareSupplierConfirmation,
  saveSupplierConfirmationReply,
  saveSupplierSourceMessage,
  saveSupplierTranslatedMessage,
  SupplierConfirmationNotFoundError,
  SupplierConfirmationProjectNotFoundError,
  SupplierConfirmationStateError,
  SupplierMessageFactError,
  SupplierMessageTranslationNotConfiguredError,
  transferSupplierConfirmationToOffer,
  translateSupplierInquiry,
  translateSupplierReply,
} from "@/modules/negotiation/application/supplier-confirmation-service";
import { supplierOfferSearchResultSchema } from "@/modules/product-search/domain/search";

const termKeySchema = z.enum([
  "UNIT_PRICE",
  "ORDER_QUANTITY",
  "MOQ",
  "INCOTERM",
  "LEAD_TIME_DAYS",
  "DIOPTERS",
  "VARIANT_MIXING",
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    productName: z.string().trim().min(1).max(300),
    result: supplierOfferSearchResultSchema,
  }),
  z.object({
    action: z.literal("markSent"),
    productUrl: z.url().max(2_000),
  }),
  z.object({
    action: z.literal("saveReply"),
    productUrl: z.url().max(2_000),
    responseNote: z.string().max(20_000),
    writtenQuote: z.string().max(50_000),
  }),
  z.object({
    action: z.literal("confirmTerm"),
    productUrl: z.url().max(2_000),
    termKey: termKeySchema,
  }),
  z.object({
    action: z.literal("transfer"),
    productUrl: z.url().max(2_000),
  }),
  z.object({
    action: z.literal("saveSource"),
    productUrl: z.url().max(2_000),
    sourceMessage: z.string().max(50_000),
  }),
  z.object({
    action: z.literal("translateInquiry"),
    productUrl: z.url().max(2_000),
    sourceMessage: z.string().max(50_000),
    targetLanguage: z.enum(["EN", "ZH", "EN_ZH"]),
  }),
  z.object({
    action: z.literal("saveTranslation"),
    productUrl: z.url().max(2_000),
    translatedMessage: z.string().max(50_000),
  }),
  z.object({
    action: z.literal("translateReply"),
    productUrl: z.url().max(2_000),
    responseNote: z.string().max(20_000),
    writtenQuote: z.string().max(50_000),
  }),
]);

function confirmationError(error: unknown) {
  if (error instanceof SupplierConfirmationProjectNotFoundError) {
    return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
  }
  if (error instanceof SupplierConfirmationNotFoundError) {
    return NextResponse.json({ error: "Potvrda ponude nije pronađena." }, { status: 404 });
  }
  if (error instanceof SupplierConfirmationStateError) {
    return NextResponse.json({ error: "Ovaj korak još nije dozvoljen." }, { status: 409 });
  }
  if (error instanceof SupplierMessageTranslationNotConfiguredError) {
    return NextResponse.json({
      error: "Prevod nije podešen. Potrebna je serverska promenljiva SUPPLIER_MESSAGE_OPENAI_API_KEY.",
    }, { status: 503 });
  }
  if (error instanceof SupplierMessageFactError) {
    const missing = error.missing.slice(0, 8).join(", ");
    return NextResponse.json({
      error: `Prevod nije sačuvan jer ne sadrži sve poslovne podatke (${missing}).`,
    }, { status: 422 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const productUrl = new URL(request.url).searchParams.get("productUrl") ?? "";
  if (!z.url().safeParse(productUrl).success) {
    return NextResponse.json({ error: "Neispravna adresa ponude." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getSupplierConfirmation(
      (await params).projectId,
      auth.membership.organizationId,
      productUrl,
    ));
  } catch (error) {
    const response = confirmationError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }

  const projectId = (await params).projectId;
  const organizationId = auth.membership.organizationId;
  try {
    const action = parsed.data;
    if (action.action === "prepare") {
      return NextResponse.json(await prepareSupplierConfirmation(projectId, organizationId, action));
    }
    if (action.action === "markSent") {
      return NextResponse.json(await markSupplierConfirmationSent(
        projectId,
        organizationId,
        action.productUrl,
      ));
    }
    if (action.action === "saveReply") {
      return NextResponse.json(await saveSupplierConfirmationReply(projectId, organizationId, action));
    }
    if (action.action === "confirmTerm") {
      return NextResponse.json(await confirmSupplierConfirmationTerm(projectId, organizationId, action));
    }
    if (action.action === "saveSource") {
      return NextResponse.json(await saveSupplierSourceMessage(projectId, organizationId, action));
    }
    if (action.action === "translateInquiry") {
      return NextResponse.json(await translateSupplierInquiry(projectId, organizationId, action));
    }
    if (action.action === "saveTranslation") {
      return NextResponse.json(await saveSupplierTranslatedMessage(projectId, organizationId, action));
    }
    if (action.action === "translateReply") {
      return NextResponse.json(await translateSupplierReply(projectId, organizationId, action));
    }
    return NextResponse.json(await transferSupplierConfirmationToOffer(
      projectId,
      organizationId,
      action.productUrl,
    ));
  } catch (error) {
    const response = confirmationError(error);
    if (response) return response;
    throw error;
  }
}
