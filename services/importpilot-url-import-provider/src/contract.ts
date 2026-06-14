import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const optionalNumberText = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : String(value)),
  z.string().trim().regex(/^\d+(?:\.\d+)?$/).nullable(),
);

export const previewRequestSchema = z.object({
  productUrl: z.string().trim().max(2_000).refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Only valid HTTPS URLs are allowed."),
}).strict();

export const productPreviewSchema = z.object({
  productTitle: optionalText(300),
  supplierName: optionalText(200),
  price: optionalNumberText,
  currency: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
    z.string().regex(/^[A-Z]{3}$/).nullable(),
  ),
  minimumOrderQuantity: optionalNumberText,
  incoterm: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
    z.string().trim().min(2).max(20).nullable(),
  ),
  imageUrl: optionalText(2_000).refine((value) => value === null || z.url().safeParse(value).success),
  productUrl: previewRequestSchema.shape.productUrl,
}).strict();

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type ProductPreview = z.infer<typeof productPreviewSchema>;

export type ErrorReason = "NETWORK_ERROR" | "BLOCKED" | "PARSING_FAILED" | "INVALID_URL" | "TIMEOUT";

export type PreviewSuccess = { preview: ProductPreview };
export type PreviewFailure = { error: string; reason: ErrorReason };
