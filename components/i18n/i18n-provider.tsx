"use client";

import { createContext, useContext, useMemo, useState } from "react";

import {
  LOCALE_COOKIE,
  type Locale,
  resolveLocale,
  translateBusinessText,
} from "@/modules/i18n/translations";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [locale, updateLocale] = useState(initialLocale);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale(nextLocale) {
      const resolved = resolveLocale(nextLocale);
      if (resolved === locale) return;

      document.cookie = `${LOCALE_COOKIE}=${resolved}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = resolved === "sr" ? "sr-Latn" : resolved;
      updateLocale(resolved);

      // A full render starts from canonical translation keys and prevents
      // already translated text from being translated a second time.
      window.location.reload();
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
