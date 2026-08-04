import { describe, expect, it } from "vitest";

import {
  excludeMainProjectImages,
  isMainProjectImage,
  isProductImageMimeType,
  selectMainProjectImage,
} from "../../modules/projects/domain/product-image";

const files = [
  {
    id: "latest-main",
    documentType: "PRODUCT_IMAGE",
    linkedOfferId: null,
  },
  {
    id: "offer-image",
    documentType: "PRODUCT_IMAGE",
    linkedOfferId: "offer-1",
  },
  {
    id: "document",
    documentType: "OFFER",
    linkedOfferId: null,
  },
];

describe("main project image", () => {
  it("selects the first project-level product image from newest-first files", () => {
    expect(selectMainProjectImage(files)?.id).toBe("latest-main");
    expect(isMainProjectImage(files[0])).toBe(true);
    expect(isMainProjectImage(files[1])).toBe(false);
  });

  it("keeps offer images and documents in the document vault", () => {
    expect(excludeMainProjectImages(files).map((file) => file.id)).toEqual([
      "offer-image",
      "document",
    ]);
  });

  it("accepts only the supported visual-search image formats", () => {
    expect(isProductImageMimeType("image/jpeg")).toBe(true);
    expect(isProductImageMimeType("image/png")).toBe(true);
    expect(isProductImageMimeType("image/webp")).toBe(true);
    expect(isProductImageMimeType("application/pdf")).toBe(false);
  });
});
