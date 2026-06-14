import { z } from "zod";

export const allowedUploadMimeTypes = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

export const initiateUploadSchema = z.object({
  projectId: z.uuid(),
  linkedOfferId: z.uuid().nullable().optional(),
  documentType: z.enum(["OFFER", "PROFORMA", "SHIPPING_QUOTE", "PRODUCT_IMAGE", "OTHER"]),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(allowedUploadMimeTypes),
  size: z.number().int().positive().max(MAX_UPLOAD_SIZE),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export const completeUploadSchema = initiateUploadSchema.extend({
  storageKey: z.string().min(1).max(1024),
});
