import { z } from "zod";

const nullableShortText = z.string().trim().min(1).max(500).nullable();
const nullableCountry = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable();
const nullableCurrency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable();

export const supplierOfferExtractionSchema = z
  .object({
    supplierName: z.string().trim().min(1).max(200),
    supplierCountry: nullableCountry,
    contactEmail: z.email().max(320).nullable(),
    contactPhone: z.string().trim().min(3).max(60).nullable(),
    moq: z.number().int().positive().nullable(),
    unitPrice: z.number().nonnegative().finite().nullable(),
    currency: nullableCurrency,
    incoterm: z.string().trim().min(2).max(20).toUpperCase().nullable(),
    deliveryTimeDays: z.number().int().nonnegative().nullable(),
    paymentTerms: nullableShortText,
    warranty: nullableShortText,
    rawExtractedText: z.string().max(200_000),
    confidenceScore: z.number().min(0).max(1),
    supplierVerified: z.boolean().nullable(),
    yearsOnPlatform: z.number().int().nonnegative().nullable(),
    responseRatePercent: z.number().min(0).max(100).nullable(),
    sampleAvailable: z.boolean().nullable(),
    termsClarityScore: z.number().int().min(0).max(100).nullable(),
    shippingClarityScore: z.number().int().min(0).max(100).nullable(),
  })
  .strict()
  .superRefine((offer, context) => {
    if ((offer.unitPrice === null) !== (offer.currency === null)) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Cena i valuta moraju biti navedene zajedno.",
      });
    }
  });

export type SupplierOfferExtractionResult = z.infer<
  typeof supplierOfferExtractionSchema
>;
