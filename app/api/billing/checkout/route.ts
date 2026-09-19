import { OrganizationRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { resolvePublicAppOrigin } from "@/modules/auth/infrastructure/google-oauth";
import {
  BillingCheckoutProviderError,
  BillingCheckoutProviderUnavailableError,
  getBillingCheckoutProvider,
} from "@/modules/subscriptions/infrastructure/checkout-provider";

const checkoutRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("SUBSCRIPTION"),
    plan: z.enum(["PLUS", "PRO"]),
  }).strict(),
  z.object({
    kind: z.literal("FULL_IMPORT_ANALYSIS"),
    projectId: z.string().uuid(),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (
    auth.membership.role !== OrganizationRole.OWNER &&
    auth.membership.role !== OrganizationRole.ADMIN
  ) {
    return NextResponse.json({ code: "BILLING_FORBIDDEN" }, { status: 403 });
  }

  const parsed = checkoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BILLING_REQUEST" }, { status: 400 });
  }

  if (parsed.data.kind === "FULL_IMPORT_ANALYSIS") {
    const project = await prisma.importProject.findFirst({
      where: {
        id: parsed.data.projectId,
        organizationId: auth.membership.organizationId,
      },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
  }

  const origin = resolvePublicAppOrigin(request.nextUrl.origin);
  const successUrl = `${origin}/billing?checkout=success`;
  const cancelUrl = `${origin}/billing?checkout=canceled`;

  try {
    const provider = getBillingCheckoutProvider();
    const session = await provider.createCheckoutSession(
      parsed.data.kind === "SUBSCRIPTION"
        ? {
            kind: "SUBSCRIPTION",
            organizationId: auth.membership.organizationId,
            userId: auth.user.id,
            email: auth.user.email,
            plan: parsed.data.plan,
            successUrl,
            cancelUrl,
          }
        : {
            kind: "FULL_IMPORT_ANALYSIS",
            organizationId: auth.membership.organizationId,
            userId: auth.user.id,
            email: auth.user.email,
            projectId: parsed.data.projectId,
            successUrl,
            cancelUrl,
          },
    );
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof BillingCheckoutProviderUnavailableError) {
      return NextResponse.json(
        { code: "BILLING_PROVIDER_NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    if (error instanceof BillingCheckoutProviderError) {
      return NextResponse.json(
        { code: "BILLING_PROVIDER_ERROR", error: error.message },
        { status: 502 },
      );
    }
    throw error;
  }
}
