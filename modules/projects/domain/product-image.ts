export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];

type ProjectFileLike = {
  documentType: string;
  linkedOfferId?: string | null;
};

export function isProductImageMimeType(value: string): value is ProductImageMimeType {
  return PRODUCT_IMAGE_MIME_TYPES.includes(value as ProductImageMimeType);
}

export function isMainProjectImage<T extends ProjectFileLike>(file: T) {
  return file.documentType === "PRODUCT_IMAGE" && !file.linkedOfferId;
}

export function selectMainProjectImage<T extends ProjectFileLike>(files: readonly T[]) {
  return files.find(isMainProjectImage) ?? null;
}

export function excludeMainProjectImages<T extends ProjectFileLike>(files: readonly T[]) {
  return files.filter((file) => !isMainProjectImage(file));
}
