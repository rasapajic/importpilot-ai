"use client";

import { createContext, useContext, useMemo } from "react";

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
  const value = useMemo<I18nValue>(() => ({
    locale: initialLocale,
    setLocale(nextLocale) {
      const resolved = resolveLocale(nextLocale);
      if (resolved === initialLocale) return;

      document.cookie = `${LOCALE_COOKIE}=${resolved}; path=/; max-age=31536000; SameSite=Lax`;
      window.location.reload();
    },
    t: (text) => translateBusinessText(text, initialLocale),
  }), [initialLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
