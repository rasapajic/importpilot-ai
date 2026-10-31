import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  supplierOfferUrlImportRequestSchema,
  supplierOfferSourceMoqCheckRequestSchema,
} from "../../modules/product-search/domain/search";
import { shouldUseAcceptanceLocalMoqReader, DILICN_187_EXACT_PRODUCT_URL, JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID } from "../../modules/product-search/infrastructure/staging-source-moq-reader";

const route = readFileSync(
  join(process.cwd(), "app/api/projects/[projectId]/supplier-search/url-preview/route.ts"),
  "utf8",
);

describe("#187 HTTP 400 staging preview contract regression", () => {
  const url = DILICN_187_EXACT_PRODUCT_URL;

  it("accepts the exact browser payload with sourceMoqCheck true", () => {
    const submitted = { productUrl: url, sourceMoqCheck: true };
    const parsed = supplierOfferSourceMoqCheckRequestSchema.safeParse(submitted);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected exact source-check payload to parse");
    expect(parsed.data).toEqual(submitted);
    expect(shouldUseAcceptanceLocalMoqReader({
      serviceId: JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID,
      enabled: "1",
      sourceMoqCheck: parsed.data.sourceMoqCheck === true,
      productUrl: parsed.data.productUrl,
    })).toBe(true);

    // This is the old defect: parsing that payload with the ordinary
    // strict import schema returned HTTP 400 before trying the source reader.
    expect(supplierOfferUrlImportRequestSchema.safeParse(submitted).success).toBe(false);
  });

  it("retains compatibility with the original preview URL-only payload", () => {
    expect(supplierOfferSourceMoqCheckRequestSchema.safeParse({ productUrl: url }).success).toBe(true);
    expect(supplierOfferUrlImportRequestSchema.safeParse({ productUrl: url }).success).toBe(true);
  });

  it("rejects malformed flags, unknown keys, unsafe schemes and non-URLs", () => {
    for (const body of [
      { productUrl: url, sourceMoqCheck: false },
      { productUrl: url, sourceMoqCheck: "true" },
      { productUrl: url, sourceMoqCheck: 1 },
      { productUrl: url, sourceMoqCheck: true, extra: "unexpected" },
      { productUrl: "http://127.0.0.1/", sourceMoqCheck: true },
      { productUrl: "not-a-url", sourceMoqCheck: true },
      { sourceMoqCheck: true },
    ]) {
      expect(supplierOfferSourceMoqCheckRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("uses this route-specific strict schema instead of the original strict importer", () => {
    expect(route).toContain("supplierOfferSourceMoqCheckRequestSchema.safeParse(rawRequest)");
    expect(route).toContain("parsed.data.sourceMoqCheck === true");
    expect(route).not.toContain("supplierOfferUrlImportRequestSchema.safeParse(rawRequest)");
  });
});
