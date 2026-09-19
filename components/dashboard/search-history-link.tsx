"use client";

import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

import type { Locale } from "@/modules/i18n/translations";

const copy: Record<Locale, { title: string; body: string }> = {
  sr: {
    title: "Otvaranje pretrage...",
    body: "Učitavamo sačuvane ponude i najnovije podatke.",
  },
  de: {
    title: "Suche wird geöffnet...",
    body: "Gespeicherte Angebote und aktuelle Daten werden geladen.",
  },
  en: {
    title: "Opening search...",
    body: "Loading saved offers and the latest data.",
  },
};

export function SearchHistoryLink({
  href,
  locale,
  children,
}: {
  href: string;
  locale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const text = copy[locale];

  function openSearch(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (pending) return;

    flushSync(() => setPending(true));
    router.push(href);
  }

  return (
    <>
      <a
        aria-busy={pending}
        className={`project-row-link${pending ? " project-row-link-loading" : ""}`}
        href={href}
        onClick={openSearch}
      >
        {children}
      </a>

      {pending && (
        <div
          aria-live="assertive"
          className="search-navigation-overlay"
          role="status"
        >
          <div className="search-navigation-card">
            <div className="loading-indicator" aria-hidden="true" />
            <strong>{text.title}</strong>
            <span>{text.body}</span>
          </div>
        </div>
      )}
    </>
  );
}
