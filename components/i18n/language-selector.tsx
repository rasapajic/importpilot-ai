"use client";

import { supportedLocales } from "@/modules/i18n/translations";
import { useI18n } from "@/components/i18n/i18n-provider";

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <nav aria-label={t("Jezik")} className="language-selector">
      {supportedLocales.map((item) => (
        <button
          aria-pressed={locale === item}
          className={locale === item ? "active" : ""}
          key={item}
          onClick={() => setLocale(item)}
          type="button"
        >
          {item.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
