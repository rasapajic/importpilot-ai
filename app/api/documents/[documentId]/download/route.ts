import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  DocumentNotFoundError,
  getDocumentDownloadUrl,
} from "@/modules/documents/application/document-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    const url = await getDocumentDownloadUrl(
      (await params).documentId,
      auth.membership.organizationId,
    );
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: "Dokument nije pronadjen." }, { status: 404 });
    }
    throw error;
  }
}
