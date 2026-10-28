import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { readCleanAttachment } from "@/modules/supplier-inbox/application/inbox-query";
import {
  AttachmentDownloadBlockedError,
  SupplierInboxNotFoundError,
} from "@/modules/supplier-inbox/domain/errors";
import { safeFilename } from "@/modules/supplier-inbox/domain/attachment-policy";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  const { projectId, attachmentId } = await params;
  try {
    const file = await readCleanAttachment({
      attachmentId,
      projectId,
      organizationId: auth.membership.organizationId,
    });
    const filename = safeFilename(file.filename).replace(/["\r\n]/g, "");
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof SupplierInboxNotFoundError) {
      return NextResponse.json({ error: "Prilog nije pronađen." }, { status: 404 });
    }
    if (error instanceof AttachmentDownloadBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
