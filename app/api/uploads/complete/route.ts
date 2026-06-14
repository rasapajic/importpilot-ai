import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  completeUpload,
  InvalidStoredObjectError,
  LinkedOfferNotFoundError,
  ProjectNotFoundError,
} from "@/modules/offers/application/upload-service";
import { completeUploadSchema } from "@/modules/offers/domain/upload-validation";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const result = completeUploadSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }

  try {
    const file = await completeUpload(result.data, auth.membership.organizationId);
    return NextResponse.json({ ...file, size: file.size.toString() }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof InvalidStoredObjectError) {
      return NextResponse.json({ error: "Uploadovani fajl nije validan." }, { status: 400 });
    }
    if (error instanceof LinkedOfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena u ovom projektu." }, { status: 404 });
    }
    throw error;
  }
}
