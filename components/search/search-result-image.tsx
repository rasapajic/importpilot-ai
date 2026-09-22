"use client";

import { useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";

const copy = {
  sr: "Slika nije preuzeta",
  de: "Bild nicht abgerufen",
  en: "Image not retrieved",
} as const;

const NON_PRODUCT_IMAGE_PATTERN =
  /(?:^|[\/_\-.])(?:logo|company[-_]?logo|favicon|icon|sprite|avatar|flag|star|badge|qr(?:code)?)(?:[\/_\-.]|$)/i;

export function isLikelyProductImageUrl(src: string | null) {
  if (!src || NON_PRODUCT_IMAGE_PATTERN.test(src)) return false;
  try {
    const url = new URL(src);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function SearchResultImage({
  src,
  title,
}: {
  src: string | null;
  title: string;
}) {
  const { locale } = useI18n();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usableSrc = isLikelyProductImageUrl(src) ? src : null;
  const failed = usableSrc !== null && failedSrc === usableSrc;

  if (!usableSrc || failed) {
    return (
      <div
        aria-label={`${copy[locale]}: ${title}`}
        className="search-result-image search-result-image-placeholder"
        role="img"
      >
        {copy[locale]}
      </div>
    );
  }

  return (
    // Provider URLs are validated and rendered without proxying or persisting image bytes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={title}
      className="search-result-image"
      loading="lazy"
      onError={() => setFailedSrc(usableSrc)}
      src={usableSrc}
    />
  );
}
