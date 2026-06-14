import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess((value) => (value === "" ? null : value), z.string().trim().min(1).max(max).nullable());
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === "" || value === null ? null : Number(value)), schema.nullable());
const optionalBoolean = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return value;
  },
  z.boolean().nullable(),
);

export const manualOfferSchema = z
  .object({
    supplierName: z.string().trim().min(1).max(200),
    supplierCountry: z.preprocess(
      (value) => (value === "" ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ),
    contactEmail: z.preprocess(
      (value) => (value === "" ? null : value),
      z.email().max(320).nullable(),
    ),
    contactPhone: optionalText(60),
    moq: optionalNumber(z.number().int().positive()),
    unitPrice: optionalNumber(z.number().nonnegative().finite()),
    currency: z.preprocess(
      (value) => (value === "" ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{3}$/).nullable(),
    ),
    incoterm: z.preprocess(
      (value) => (value === "" ? null : String(value).toUpperCase()),
      z.string().trim().min(2).max(20).nullable(),
    ),
    deliveryTimeDays: optionalNumber(z.number().int().nonnegative()),
    paymentTerms: optionalText(500),
    warranty: optionalText(500),
    supplierVerified: optionalBoolean,
    yearsOnPlatform: optionalNumber(z.number().int().nonnegative()),
    responseRatePercent: optionalNumber(z.number().min(0).max(100)),
    transactionCount: optionalNumber(z.number().int().nonnegative()),
    employeeCount: optionalNumber(z.number().int().nonnegative()),
    profileCompletenessScore: optionalNumber(z.number().int().min(0).max(100)),
    sampleAvailable: optionalBoolean,
    termsClarityScore: optionalNumber(z.number().int().min(0).max(100)),
    shippingClarityScore: optionalNumber(z.number().int().min(0).max(100)),
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
