"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { useI18n } from "@/components/i18n/i18n-provider";

export function GlobalHeaderActions() {
  const pathname = usePathname();
  const { t } = useI18n();
  const isAuthenticatedArea = pathname === "/dashboard" || pathname.startsWith("/projects/");

  return (
    <div className="global-header-actions">
      <LanguageSelector />
      {isAuthenticatedArea && (
        <div className="header-account-actions">
          <Link href="/dashboard">{t("Account")}</Link>
          <LogoutButton compact />
        </div>
      )}
    </div>
  );
}
