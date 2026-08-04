import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  completeUpload,
  InvalidStoredObjectError,
  LinkedOfferNotFoundError,
  ProjectNotFoundError,
} from "@/modules/offers/application/upload-service";
import { completeUploadSchema } from "@/modules/offers/domain/upload-validation";
import { deleteStoredObject, storeObject } from "@/lib/storage/s3";

export const runtime = "nodejs";

function invalidRequest(message = "Neispravni podaci za sliku.") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const metadataValue = formData?.get("metadata");
  const fileValue = formData?.get("file");

  if (typeof metadataValue !== "string" || !(fileValue instanceof File)) {
    return invalidRequest();
  }

  const parsedMetadata = (() => {
    try {
      return JSON.parse(metadataValue) as unknown;
    } catch {
      return null;
    }
  })();
  const result = completeUploadSchema.safeParse(parsedMetadata);
  if (!result.success) {
    return invalidRequest(result.error.issues[0]?.message);
  }
  if (result.data.documentType !== "PRODUCT_IMAGE" || result.data.linkedOfferId !== null) {
    return invalidRequest("Rezervni upload je dozvoljen samo za glavnu sliku proizvoda.");
  }
  if (
    fileValue.size !== result.data.size ||
    fileValue.type !== result.data.mimeType ||
    fileValue.name !== result.data.originalFilename
  ) {
    return invalidRequest("Podaci slike se ne podudaraju sa izabranim fajlom.");
  }

  const body = new Uint8Array(await fileValue.arrayBuffer());
  const checksum = createHash("sha256").update(body).digest("hex");
  if (checksum !== result.data.checksum) {
    return invalidRequest("Kontrolni zbir slike nije ispravan.");
  }

  let objectStored = false;
  try {
    await storeObject({
      storageKey: result.data.storageKey,
      mimeType: result.data.mimeType,
      checksum: result.data.checksum,
      body,
    });
    objectStored = true;

    const file = await completeUpload(result.data, auth.membership.organizationId);
    return NextResponse.json({ ...file, size: file.size.toString() }, { status: 201 });
  } catch (error) {
    if (objectStored) {
      try {
        await deleteStoredObject(result.data.storageKey);
      } catch (cleanupError) {
        console.error("Failed to clean up product-image fallback upload.", {
          storageKey: result.data.storageKey,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }

    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof InvalidStoredObjectError) {
      return NextResponse.json({ error: "Uploadovana slika nije validna." }, { status: 400 });
    }
    if (error instanceof LinkedOfferNotFoundError) {
      return NextResponse.json({ error: "Ponuda nije pronađena u ovom projektu." }, { status: 404 });
    }

    console.error("Product-image fallback upload failed.", {
      projectId: result.data.projectId,
      storageKey: result.data.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Slika nije sačuvana kroz bezbedni rezervni upload." },
      { status: 500 },
    );
  }
}
