"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";

const copy = {
  sr: "Bez dostupne slike",
  de: "Kein Bild verfügbar",
  en: "No image available",
} as const;

export function SearchResultImage({
  src,
  title,
}: {
  src: string | null;
  title: string;
}) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
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
      alt=""
      className="search-result-image"
      loading="lazy"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
