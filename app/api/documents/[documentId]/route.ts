import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  deleteDocument,
  DocumentNotFoundError,
} from "@/modules/documents/application/document-service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    await deleteDocument((await params).documentId, auth.membership.organizationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: "Dokument nije pronadjen." }, { status: 404 });
    }
    throw error;
  }
}
