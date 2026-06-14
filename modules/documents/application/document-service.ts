import { ProjectActivityType } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { createDownloadUrl, deleteStoredObject } from "@/lib/storage/s3";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

export class DocumentNotFoundError extends Error {}

export function findTenantDocument(documentId: string, organizationId: string) {
  return prisma.uploadedFile.findFirst({
    where: { id: documentId, organizationId },
  });
}

export async function getDocumentDownloadUrl(
  documentId: string,
  organizationId: string,
) {
  const document = await findTenantDocument(documentId, organizationId);
  if (!document) throw new DocumentNotFoundError();
  return createDownloadUrl(document.storageKey, document.originalFilename);
}

export async function deleteDocument(documentId: string, organizationId: string) {
  const document = await findTenantDocument(documentId, organizationId);
  if (!document) throw new DocumentNotFoundError();

  await deleteStoredObject(document.storageKey);
  await prisma.$transaction(async (transaction) => {
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: document.projectId,
      type: ProjectActivityType.DOCUMENT_DELETED,
      title: "Dokument je obrisan",
      description: document.originalFilename,
      metadata: {
        documentId: document.id,
        documentType: document.documentType,
        originalFilename: document.originalFilename,
      },
    });
    await transaction.uploadedFile.delete({ where: { id: document.id } });
  });
}
