import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  initiateUpload,
  LinkedOfferNotFoundError,
  ProjectNotFoundError,
} from "@/modules/offers/application/upload-service";
import { initiateUploadSchema } from "@/modules/offers/domain/upload-validation";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const result = initiateUploadSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await initiateUpload(result.data, auth.membership.organizationId),
    );
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof LinkedOfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena u ovom projektu." }, { status: 404 });
    }
    throw error;
  }
}
