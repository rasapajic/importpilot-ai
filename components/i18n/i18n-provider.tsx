"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";

import {
  LOCALE_COOKIE,
  type Locale,
  resolveLocale,
  translateBusinessText,
  translateText,
} from "@/modules/i18n/translations";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function translateElement(root: ParentNode, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE", "PRE"].includes(parent.tagName) && node.textContent) {
      const translated = translateText(node.textContent, locale);
      if (translated !== node.textContent) node.textContent = translated;
    }
    node = walker.nextNode();
  }

  root.querySelectorAll?.<HTMLElement>("[placeholder], [title], [aria-label]").forEach((element) => {
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const translated = translateText(value, locale);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  });
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [locale, updateLocale] = useState(initialLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale === "sr" ? "sr-Latn" : locale;
    translateElement(document.body, locale);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) translateElement(node, locale);
          else if (node.nodeType === Node.TEXT_NODE && node.parentElement) translateElement(node.parentElement, locale);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale(nextLocale) {
      const resolved = resolveLocale(nextLocale);
      document.cookie = `${LOCALE_COOKIE}=${resolved}; path=/; max-age=31536000; samesite=lax`;
      updateLocale(resolved);
    },
    t: (text) => translateBusinessText(text, locale),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
