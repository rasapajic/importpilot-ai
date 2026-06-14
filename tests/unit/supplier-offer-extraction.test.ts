import { describe, expect, it } from "vitest";

import { supplierOfferExtractionSchema } from "../../modules/offers/domain/extraction-schema";

const validExtraction = {
  supplierName: "Shenzhen Example Manufacturing",
  supplierCountry: "CN",
  contactEmail: "sales@example.test",
  contactPhone: "+86 123 4567",
  moq: 500,
  unitPrice: 12.5,
  currency: "USD",
  incoterm: "FOB",
  deliveryTimeDays: 30,
  paymentTerms: "30% deposit, 70% before shipment",
  warranty: "12 months",
  rawExtractedText: "Supplier offer text",
  confidenceScore: 0.92,
  supplierVerified: null,
  yearsOnPlatform: null,
  responseRatePercent: null,
  sampleAvailable: null,
  termsClarityScore: null,
  shippingClarityScore: null,
};

describe("supplier offer extraction schema", () => {
  it("accepts a complete structured extraction", () => {
    expect(supplierOfferExtractionSchema.parse(validExtraction)).toMatchObject({
      supplierCountry: "CN",
      currency: "USD",
      confidenceScore: 0.92,
    });
  });

  it("requires explicit nulls for missing fields", () => {
    const missingField = { ...validExtraction } as Partial<typeof validExtraction>;
    delete missingField.warranty;
    expect(supplierOfferExtractionSchema.safeParse(missingField).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      supplierOfferExtractionSchema.safeParse({ ...validExtraction, inventedRisk: "low" }).success,
    ).toBe(false);
  });

  it("rejects invalid confidence and incomplete price pairs", () => {
    expect(
      supplierOfferExtractionSchema.safeParse({ ...validExtraction, confidenceScore: 1.1 }).success,
    ).toBe(false);
    expect(
      supplierOfferExtractionSchema.safeParse({ ...validExtraction, currency: null }).success,
    ).toBe(false);
  });
});
