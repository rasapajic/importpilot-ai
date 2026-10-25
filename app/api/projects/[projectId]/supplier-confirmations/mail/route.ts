import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { isSameOrigin } from "@/modules/auth/infrastructure/request-context";
import {
  getSupplierGmailSendPreview,
  sendSupplierGmailInquiry,
  SupplierGmailSendBlockedError,
  SupplierGmailSendUncertainError,
} from "@/modules/negotiation/application/supplier-gmail-send-service";
import { GmailConnectNotConfiguredError } from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

const commonSchema = z.object({
  productUrl: z.url().max(2000),
  mailboxConnectionId: z.uuid(),
  recipient: z.email().max(320),
});

const postSchema = commonSchema.extend({
  approvedHash: z.string().regex(/^[0-9a-f]{64}$/i),
  explicitApproval: z.literal(true),
});

function errorResponse(error: unknown) {
  if (error instanceof GmailConnectNotConfiguredError) {
    return NextResponse.json({ error: "Gmail nije omogućen na ovom okruženju." }, { status: 503 });
  }
  if (error instanceof SupplierGmailSendBlockedError) {
    return NextResponse.json({
      code: error.code,
      error: "Slanje nije dozvoljeno. Proverite primaoca, odobrenje i aktuelni prevod.",
    }, { status: 409 });
  }
  if (error instanceof SupplierGmailSendUncertainError) {
    return NextResponse.json({
      code: "DELIVERY_UNCERTAIN",
      error: "Ishod slanja nije potvrđen. Ne šaljite ponovo dok se status ne proveri.",
    }, { status: 409 });
  }
  return NextResponse.json({ error: "Zahtev trenutno nije uspeo." }, { status: 500 });
}

async function authorize() {
  const auth = await getCurrentSession();
  if (!auth) return { response: NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 }) } as const;
  if (!["OWNER", "ADMIN"].includes(auth.membership.role)) {
    return { response: NextResponse.json({ error: "Nemate dozvolu." }, { status: 403 }) } as const;
  }
  return { auth } as const;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await authorize();
  if ("response" in context) return context.response;
  const input = commonSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const projectId = (await params).projectId;
  if (!z.uuid().safeParse(projectId).success || !input.success) {
    return NextResponse.json({ error: "Neispravni podaci za pregled poruke." }, { status: 400 });
  }
  try {
    const result = await getSupplierGmailSendPreview({
      ...input.data,
      projectId,
      organizationId: context.auth.membership.organizationId,
      userId: context.auth.user.id,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await authorize();
  if ("response" in context) return context.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Zahtev nije dozvoljen." }, { status: 403 });
  }
  const projectId = (await params).projectId;
  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(projectId).success || !body.success) {
    return NextResponse.json({ error: "Neispravni podaci ili nije potvrđeno slanje." }, { status: 400 });
  }
  try {
    const result = await sendSupplierGmailInquiry({
      ...body.data,
      projectId,
      userId: context.auth.user.id,
      organizationId: context.auth.membership.organizationId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
