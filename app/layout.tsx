import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { GlobalHeaderActions } from "@/components/layout/global-header-actions";
import { LOCALE_COOKIE, resolveLocale } from "@/modules/i18n/translations";

import "./globals.css";

export const metadata: Metadata = {
  title: "ImportPilot AI",
  description: "Platforma za sigurnije poređenje ponuda i međunarodnu nabavku.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale === "sr" ? "sr-Latn" : locale}>
      <body>
        <I18nProvider initialLocale={locale}>
          <header className="global-header">
            <strong className="global-brand">ImportPilot AI</strong>
            <GlobalHeaderActions />
          </header>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
