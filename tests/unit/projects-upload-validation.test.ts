import { describe, expect, it } from "vitest";

import {
  createProjectSchema,
  listProjectsSchema,
} from "../../modules/projects/domain/validation";
import {
  initiateUploadSchema,
  MAX_UPLOAD_SIZE,
} from "../../modules/offers/domain/upload-validation";

describe("project validation", () => {
  it("normalizes country and numeric form values", () => {
    const result = createProjectSchema.parse({
      name: "Solar Panels",
      targetCountry: "de",
      quantity: "500",
      targetMargin: "22.50",
    });
    expect(result).toMatchObject({
      targetCountry: "DE",
      quantity: 500,
      targetMargin: 22.5,
    });
  });

  it("normalizes the legacy Serbia target country code to RS", () => {
    expect(createProjectSchema.parse({
      name: "PTZ camera",
      targetCountry: "SR",
      quantity: 100,
      targetMargin: 25,
    }).targetCountry).toBe("RS");
  });

  it("rejects invalid quantities and margins", () => {
    expect(
      createProjectSchema.safeParse({
        name: "Invalid",
        targetCountry: "DE",
        quantity: 0,
        targetMargin: 101,
      }).success,
    ).toBe(false);
  });

  it("caps pagination size", () => {
    expect(listProjectsSchema.safeParse({ pageSize: 51 }).success).toBe(false);
  });

  it("accepts project completion filters", () => {
    expect(listProjectsSchema.safeParse({ completionStatus: "COMPLETED" }).success).toBe(true);
  });
});

describe("direct upload validation", () => {
  const valid = {
    projectId: crypto.randomUUID(),
    documentType: "OFFER",
    linkedOfferId: null,
    originalFilename: "offer.pdf",
    mimeType: "application/pdf",
    size: 100,
    checksum: "a".repeat(64),
  };

  it("accepts supported supplier offer files", () => {
    expect(initiateUploadSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts every document vault type and an optional offer link", () => {
    for (const documentType of ["OFFER", "PROFORMA", "SHIPPING_QUOTE", "PRODUCT_IMAGE", "OTHER"]) {
      expect(
        initiateUploadSchema.safeParse({
          ...valid,
          documentType,
          linkedOfferId: crypto.randomUUID(),
        }).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported, oversized and malformed uploads", () => {
    expect(initiateUploadSchema.safeParse({ ...valid, mimeType: "text/html" }).success).toBe(false);
    expect(initiateUploadSchema.safeParse({ ...valid, size: MAX_UPLOAD_SIZE + 1 }).success).toBe(false);
    expect(initiateUploadSchema.safeParse({ ...valid, checksum: "invalid" }).success).toBe(false);
    expect(initiateUploadSchema.safeParse({ ...valid, documentType: "INVOICE" }).success).toBe(false);
  });
});
