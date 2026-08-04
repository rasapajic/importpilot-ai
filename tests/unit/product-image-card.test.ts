import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(process.cwd(), "components/projects/product-image-card.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);
const uploadServiceSource = readFileSync(
  join(process.cwd(), "modules/offers/application/upload-service.ts"),
  "utf8",
);
const fallbackRouteSource = readFileSync(
  join(process.cwd(), "app/api/uploads/product-image-fallback/route.ts"),
  "utf8",
);
const storageSource = readFileSync(
  join(process.cwd(), "lib/storage/s3.ts"),
  "utf8",
);

describe("product image card", () => {
  it("places one main product image inside the selected-product step", () => {
    expect(pageSource).toContain("ProductImageCard");
    expect(pageSource).toContain("selectMainProjectImage(project.files)");
    expect(pageSource).toContain("excludeMainProjectImages(project.files)");
    expect(pageSource).toContain("image={mainProductImage");
  });

  it("supports private upload, drag and drop, gallery selection and phone camera", () => {
    expect(componentSource).toContain('fetch("/api/uploads/initiate"');
    expect(componentSource).toContain('fetch("/api/uploads/complete"');
    expect(componentSource).toContain('fetch("/api/uploads/product-image-fallback"');
    expect(componentSource).toContain("new FormData()");
    expect(componentSource).toContain("onDrop={onDrop}");
    expect(componentSource).toContain('capture="environment"');
    expect(componentSource).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it("falls back to the authenticated app route when browser-to-MinIO upload fails", () => {
    expect(componentSource).toContain("directUploadSucceeded");
    expect(componentSource).toContain("uploadThroughApplication");
    expect(fallbackRouteSource).toContain("authenticateRequest");
    expect(fallbackRouteSource).toContain("createHash(\"sha256\")");
    expect(fallbackRouteSource).toContain("storeObject");
    expect(fallbackRouteSource).toContain("completeUpload");
    expect(fallbackRouteSource).toContain("deleteStoredObject");
    expect(storageSource).toContain("export async function storeObject");
  });

  it("shows the authenticated private image and allows replacement or deletion", () => {
    expect(componentSource).toContain('/api/documents/${image.id}/download');
    expect(componentSource).toContain('method: "DELETE"');
    expect(componentSource).toContain("Promeni sliku");
    expect(componentSource).toContain("Obriši sliku");
  });

  it("replaces previous project-level images without touching offer images", () => {
    expect(uploadServiceSource).toContain("isMainProductImageUpload");
    expect(uploadServiceSource).toContain("linkedOfferId: null");
    expect(uploadServiceSource).toContain("previousProjectImages");
    expect(uploadServiceSource).toContain("deleteStoredObject(previous.storageKey)");
  });

  it("uses the centrally configured assistant name", () => {
    expect(componentSource).toContain("ASSISTANT_DISPLAY_NAME");
    expect(componentSource).not.toContain('const assistantName = "TAJA"');
  });
});
