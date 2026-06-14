"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { dashboardPrimaryActions } from "@/modules/dashboard/primary-actions";

export function DashboardPrimaryActions() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <nav className="dashboard-primary-actions" aria-label={t("Primary actions")} ref={rootRef}>
      {dashboardPrimaryActions.map((action) => (
        <article className="dashboard-action-card" key={action.href}>
          <span className="dashboard-action-heading">
            <Link className="dashboard-action-link" href={action.href}>
              <strong>{t(action.label)}</strong>
            </Link>
            <span className="dashboard-action-info">
              <button
                aria-expanded={open === action.href}
                aria-label={t(action.help)}
                aria-controls={`dashboard-action-tip-${action.href.replace(/[^a-z0-9]/gi, "-")}`}
                className="info-icon"
                onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                    setOpen((current) => current === action.href ? null : current);
                  }
                }}
                onClick={(event) => {
                  event.preventDefault();
                  setOpen((current) => current === action.href ? null : action.href);
                }}
                onMouseEnter={() => setOpen(action.href)}
                onMouseLeave={() => setOpen((current) => current === action.href ? null : current)}
                type="button"
              >
                i
              </button>
              <span
                className={`action-tooltip ${open === action.href ? "action-tooltip-open" : ""}`}
                id={`dashboard-action-tip-${action.href.replace(/[^a-z0-9]/gi, "-")}`}
                onMouseEnter={() => setOpen(action.href)}
                onMouseLeave={() => setOpen((current) => current === action.href ? null : current)}
                role="tooltip"
              >
                {t(action.help)}
              </span>
            </span>
          </span>
        </article>
      ))}
    </nav>
  );
}
