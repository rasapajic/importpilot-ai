import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { GlobalHeaderActions } from "@/components/layout/global-header-actions";
import { PwaInstallButton } from "@/components/pwa/pwa-install-button";
import { LOCALE_COOKIE, resolveLocale } from "@/modules/i18n/translations";

import "./globals.css";
import "./auth-password.css";
import "./taja-search-progress.css";
import "./search-result-actions.css";
import "./taja-requirement-match.css";
import "./marketplace-evidence.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b5f41",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "JAKOV360",
  applicationName: "JAKOV360",
  description: "Platforma za sigurnije poređenje ponuda i međunarodnu nabavku.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/pwa-icon-192", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa-icon-192", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JAKOV360",
  },
  other: {
    google: "notranslate",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const legalCopy = {
    sr: { privacy: "Politika privatnosti", terms: "Uslovi korišćenja" },
    de: { privacy: "Datenschutz", terms: "Nutzungsbedingungen" },
    en: { privacy: "Privacy Policy", terms: "Terms of Service" },
  }[locale];

  return (
    <html lang={locale === "sr" ? "sr-Latn" : locale} translate="no">
      <body className="notranslate">
        <I18nProvider initialLocale={locale}>
          <header className="global-header">
            <strong className="global-brand">JAKOV360</strong>
            <GlobalHeaderActions />
          </header>
          {children}
          <footer className="global-footer">
            <nav aria-label="Legal and privacy">
              <Link href="/privacy">{legalCopy.privacy}</Link>
              <Link href="/terms">{legalCopy.terms}</Link>
              <a href="mailto:privacy@jakov360.com">privacy@jakov360.com</a>
            </nav>
            <div className="global-footer-actions">
              <PwaInstallButton />
              <p>© 2026 JAKOV360</p>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
