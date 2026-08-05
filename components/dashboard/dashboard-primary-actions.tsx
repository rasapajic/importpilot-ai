"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import {
  dashboardPrimaryActions,
  type DashboardPrimaryActionKey,
} from "@/modules/dashboard/primary-actions";
import type { Locale } from "@/modules/i18n/translations";

type ActionCopy = {
  label: string;
  help: string;
};

const navigationCopy: Record<Locale, string> = {
  sr: "Načini unosa proizvoda",
  de: "Möglichkeiten zur Produkteingabe",
  en: "Product entry options",
};

const actionCopy: Record<Locale, Record<DashboardPrimaryActionKey, ActionCopy>> = {
  sr: {
    describe: {
      label: "Opišite proizvod",
      help: "Počnite nazivom ili kratkim opisom proizvoda. Količinu, zemlju uvoza i ciljnu maržu unosite u sledećem koraku.",
    },
    url: {
      label: "Nalepite link",
      help: "Koristite kada već imate link sa Alibaba, Made-in-China ili sličnog sajta.",
    },
  },
  de: {
    describe: {
      label: "Produkt beschreiben",
      help: "Beginnen Sie mit dem Produktnamen oder einer kurzen Beschreibung. Menge, Einfuhrland und Zielmarge folgen im nächsten Schritt.",
    },
    url: {
      label: "Produktlink einfügen",
      help: "Verwenden Sie diese Option, wenn Sie bereits einen Link von Alibaba, Made-in-China oder einer ähnlichen Website haben.",
    },
  },
  en: {
    describe: {
      label: "Describe product",
      help: "Start with the product name or a short description. Quantity, import country, and target margin come in the next step.",
    },
    url: {
      label: "Paste product link",
      help: "Use this when you already have a link from Alibaba, Made-in-China, or a similar site.",
    },
  },
};

export function DashboardPrimaryActions() {
  const { locale } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const copy = actionCopy[locale];

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
    <nav
      className="dashboard-primary-actions"
      aria-label={navigationCopy[locale]}
      ref={rootRef}
    >
      {dashboardPrimaryActions.map((action) => {
        const text = copy[action.key];
        return (
          <article className="dashboard-action-card" key={action.href}>
            <span className="dashboard-action-heading">
              <Link className="dashboard-action-link" href={action.href}>
                <strong>{text.label}</strong>
              </Link>
              <span className="dashboard-action-info">
                <button
                  aria-expanded={open === action.href}
                  aria-label={text.help}
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
                  {text.help}
                </span>
              </span>
            </span>
          </article>
        );
      })}
    </nav>
  );
}
