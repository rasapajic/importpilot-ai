import { randomUUID } from "node:crypto";

import {
  DocumentType,
  FileProcessingStatus,
  ProcessingJobType,
  ProjectActivityType,
  ProjectStatus,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { jobQueue } from "@/lib/queue/postgres-job-queue";
import {
  createDirectUploadUrl,
  inspectStoredObject,
} from "@/lib/storage/s3";
import { findOrganizationProject } from "@/modules/projects/application/project-service";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";
import type {
  completeUploadSchema,
  initiateUploadSchema,
} from "@/modules/offers/domain/upload-validation";
import type { z } from "zod";

type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;
type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export class ProjectNotFoundError extends Error {}
export class InvalidStoredObjectError extends Error {}
export class LinkedOfferNotFoundError extends Error {}

function storagePrefix(organizationId: string, projectId: string) {
  return `organizations/${organizationId}/projects/${projectId}/`;
}

export async function initiateUpload(input: InitiateUploadInput, organizationId: string) {
  if (!(await findOrganizationProject(input.projectId, organizationId))) {
    throw new ProjectNotFoundError();
  }
  await validateLinkedOffer(input.linkedOfferId, input.projectId, organizationId);

  const extension = input.originalFilename.includes(".")
    ? `.${input.originalFilename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}`
    : "";
  const storageKey = `${storagePrefix(organizationId, input.projectId)}${randomUUID()}${extension}`;
  const uploadUrl = await createDirectUploadUrl({
    storageKey,
    mimeType: input.mimeType,
    checksum: input.checksum,
  });

  return {
    storageKey,
    uploadUrl,
    expiresInSeconds: 600,
    requiredHeaders: {
      "content-type": input.mimeType,
      "x-amz-meta-checksum": input.checksum,
    },
  };
}

export async function completeUpload(input: CompleteUploadInput, organizationId: string) {
  if (!input.storageKey.startsWith(storagePrefix(organizationId, input.projectId))) {
    throw new InvalidStoredObjectError();
  }
  if (!(await findOrganizationProject(input.projectId, organizationId))) {
    throw new ProjectNotFoundError();
  }
  await validateLinkedOffer(input.linkedOfferId, input.projectId, organizationId);

  const object = await inspectStoredObject(input.storageKey);
  if (
    object.ContentLength !== input.size ||
    object.ContentType !== input.mimeType ||
    object.Metadata?.checksum !== input.checksum
  ) {
    throw new InvalidStoredObjectError();
  }

  return prisma.$transaction(async (transaction) => {
    const file = await transaction.uploadedFile.create({
      data: {
        organizationId,
        projectId: input.projectId,
        linkedOfferId: input.linkedOfferId,
        documentType: input.documentType,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        size: BigInt(input.size),
        checksum: input.checksum,
        storageKey: input.storageKey,
        processingStatus:
          input.documentType === DocumentType.OFFER
            ? FileProcessingStatus.QUEUED
            : FileProcessingStatus.COMPLETED,
      },
    });
    if (input.documentType === DocumentType.OFFER) {
      await jobQueue.enqueue(
        {
          type: ProcessingJobType.OCR_EXTRACTION,
          fileId: file.id,
          payload: {
            fileId: file.id,
            organizationId,
            projectId: input.projectId,
            storageKey: input.storageKey,
          },
        },
        transaction,
      );
      await transaction.importProject.update({
        where: { id: input.projectId },
        data: { status: ProjectStatus.COLLECTING_OFFERS },
      });
    }
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: input.projectId,
      type: ProjectActivityType.DOCUMENT_UPLOADED,
      title: "Dokument je uploadovan",
      description: input.originalFilename,
      metadata: {
        documentId: file.id,
        documentType: input.documentType,
        originalFilename: input.originalFilename,
        linkedOfferId: input.linkedOfferId ?? null,
      },
    });
    if (input.documentType === DocumentType.OFFER) {
      await recordProjectActivity(transaction, {
        organizationId,
        projectId: input.projectId,
        type: ProjectActivityType.OFFER_ADDED,
        title: "Ponuda je dodata",
        description: input.originalFilename,
        metadata: { documentId: file.id, source: "UPLOAD" },
      });
    }
    return file;
  });
}

async function validateLinkedOffer(
  linkedOfferId: string | null | undefined,
  projectId: string,
  organizationId: string,
) {
  if (!linkedOfferId) return;
  const offer = await prisma.supplierOffer.findFirst({
    where: { id: linkedOfferId, projectId, organizationId },
    select: { id: true },
  });
  if (!offer) throw new LinkedOfferNotFoundError();
}
