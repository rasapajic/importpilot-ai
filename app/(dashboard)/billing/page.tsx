import { OrganizationRole } from "@prisma/client";
import Link from "next/link";

import { BillingCheckoutButton } from "@/components/billing/billing-checkout-button";
import { prisma } from "@/lib/database/prisma";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";
import { getBillingAccountSummary } from "@/modules/subscriptions/application/billing-service";
import { getMonthlySupplierSearchQuotaStatus } from "@/modules/subscriptions/application/supplier-search-quota-service";
import {
  JAKOV360_FULL_IMPORT_ANALYSIS,
  JAKOV360_PLANS,
} from "@/modules/subscriptions/domain/jakov360-paid-plans";
import { isBillingCheckoutConfigured } from "@/modules/subscriptions/infrastructure/checkout-provider";

import styles from "./billing.module.css";

type Copy = {
  back: string;
  title: string;
  subtitle: string;
  currentPlan: string;
  usage: (used: number, limit: number) => string;
  resets: string;
  choosePlan: string;
  monthly: string;
  searches: (count: number) => string;
  current: string;
  checkoutUnavailable: string;
  ownerOnly: string;
  subscriptionEnds: string;
  cancellationScheduled: string;
  oneOffTitle: string;
  oneOffBody: string;
  oneOffIncludes: string;
  selectProject: string;
  selectedProject: string;
  checkoutSuccess: string;
  checkoutCanceled: string;
};

const copy: Record<Locale, Copy> = {
  sr: {
    back: "Nazad na pretrage",
    title: "Plan i naplata",
    subtitle: "Kontrolišite mesečni limit pretraga i plaćene opcije JAKOV360.",
    currentPlan: "Trenutni plan",
    usage: (used, limit) => `${used} od ${limit} živih pretraga iskorišćeno`,
    resets: "Novi mesečni limit počinje",
    choosePlan: "Mesečni planovi",
    monthly: "mesečno",
    searches: (count) => `${count} živih pretraga mesečno`,
    current: "Trenutni plan",
    checkoutUnavailable: "Payment provider još nije povezan. Planovi se ne mogu naplatiti dok se to ne završi.",
    ownerOnly: "Samo vlasnik ili administrator naloga može menjati plan.",
    subscriptionEnds: "Aktuelni obračunski period traje do",
    cancellationScheduled: "Otkazivanje je zakazano za kraj perioda.",
    oneOffTitle: "Full Import Analysis",
    oneOffBody: "Jednokratna analiza za konkretan projekat bez mesečne pretplate.",
    oneOffIncludes: "Uključuje 1 dodatnu živu pretragu + 1 punu uvoznu analizu.",
    selectProject: "Otvorite billing iz konkretnog projekta da biste kupili analizu za taj projekat.",
    selectedProject: "Projekat",
    checkoutSuccess: "Checkout je završen. Plan/entitlement će biti aktivan čim payment provider potvrdi uplatu.",
    checkoutCanceled: "Plaćanje je otkazano. Ništa nije promenjeno.",
  },
  de: {
    back: "Zurück zu den Suchen",
    title: "Tarif und Abrechnung",
    subtitle: "Verwalten Sie das monatliche Suchlimit und die kostenpflichtigen JAKOV360-Optionen.",
    currentPlan: "Aktueller Tarif",
    usage: (used, limit) => `${used} von ${limit} Live-Suchen verwendet`,
    resets: "Das neue Monatslimit beginnt am",
    choosePlan: "Monatliche Tarife",
    monthly: "monatlich",
    searches: (count) => `${count} Live-Suchen pro Monat`,
    current: "Aktueller Tarif",
    checkoutUnavailable: "Der Zahlungsanbieter ist noch nicht verbunden. Tarife können bis dahin nicht berechnet werden.",
    ownerOnly: "Nur Kontoinhaber oder Administratoren können den Tarif ändern.",
    subscriptionEnds: "Der aktuelle Abrechnungszeitraum läuft bis",
    cancellationScheduled: "Die Kündigung ist zum Periodenende vorgemerkt.",
    oneOffTitle: "Full Import Analysis",
    oneOffBody: "Einmalige Analyse für ein konkretes Projekt ohne Monatsabo.",
    oneOffIncludes: "Enthält 1 zusätzliche Live-Suche + 1 vollständige Importanalyse.",
    selectProject: "Öffnen Sie die Abrechnung aus einem konkreten Projekt, um die Analyse dafür zu kaufen.",
    selectedProject: "Projekt",
    checkoutSuccess: "Checkout abgeschlossen. Tarif/Entitlement wird aktiv, sobald der Zahlungsanbieter die Zahlung bestätigt.",
    checkoutCanceled: "Zahlung abgebrochen. Es wurde nichts geändert.",
  },
  en: {
    back: "Back to searches",
    title: "Plan and billing",
    subtitle: "Manage the monthly search limit and paid JAKOV360 options.",
    currentPlan: "Current plan",
    usage: (used, limit) => `${used} of ${limit} live searches used`,
    resets: "The new monthly limit starts",
    choosePlan: "Monthly plans",
    monthly: "monthly",
    searches: (count) => `${count} live searches per month`,
    current: "Current plan",
    checkoutUnavailable: "The payment provider is not connected yet. Plans cannot be charged until it is connected.",
    ownerOnly: "Only the account owner or an administrator can change the plan.",
    subscriptionEnds: "The current billing period runs until",
    cancellationScheduled: "Cancellation is scheduled for the end of the period.",
    oneOffTitle: "Full Import Analysis",
    oneOffBody: "One-off analysis for a specific project without a monthly subscription.",
    oneOffIncludes: "Includes 1 additional live search + 1 full import analysis.",
    selectProject: "Open billing from a specific project to buy the analysis for that project.",
    selectedProject: "Project",
    checkoutSuccess: "Checkout completed. The plan/entitlement becomes active when the payment provider confirms payment.",
    checkoutCanceled: "Payment canceled. Nothing was changed.",
  },
};

function euro(cents: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "sr" ? "sr-Latn" : locale, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function date(value: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; checkout?: string }>;
}) {
  const { membership } = await requireSession();
  const locale = await getServerLocale();
  const text = copy[locale];
  const params = await searchParams;
  const canManage = membership.role === OrganizationRole.OWNER ||
    membership.role === OrganizationRole.ADMIN;
  const checkoutConfigured = isBillingCheckoutConfigured();

  const [quota, billing] = await Promise.all([
    getMonthlySupplierSearchQuotaStatus(membership.organizationId),
    getBillingAccountSummary(membership.organizationId),
  ]);

  const project = params.projectId
    ? await prisma.importProject.findFirst({
        where: {
          id: params.projectId,
          organizationId: membership.organizationId,
        },
        select: { id: true, name: true },
      })
    : null;

  const plans = [JAKOV360_PLANS.FREE, JAKOV360_PLANS.PLUS, JAKOV360_PLANS.PRO];
  const planRank = { FREE: 0, PLUS: 1, PRO: 2 } as const;

  return (
    <main className={`dashboard-shell ${styles.shell}`}>
      <p><Link href="/dashboard">← {text.back}</Link></p>
      <header className={styles.hero}>
        <p className="eyebrow">JAKOV360</p>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </header>

      {params.checkout === "success" && (
        <p className="success-text" role="status">{text.checkoutSuccess}</p>
      )}
      {params.checkout === "canceled" && (
        <p className="warning-text" role="status">{text.checkoutCanceled}</p>
      )}

      <section className={styles.currentCard}>
        <div>
          <span>{text.currentPlan}</span>
          <strong>{billing.plan}</strong>
        </div>
        <div>
          <span>{text.usage(quota.used, quota.limit)}</span>
          <strong>{quota.remaining}</strong>
        </div>
        <p>{text.resets}: {date(quota.periodEnd, locale)}</p>
        {billing.activeSubscription?.currentPeriodEnd && (
          <p>
            {text.subscriptionEnds}: {date(billing.activeSubscription.currentPeriodEnd, locale)}.
            {billing.activeSubscription.cancelAtPeriodEnd && <> {text.cancellationScheduled}</>}
          </p>
        )}
      </section>

      {!checkoutConfigured && <p className="warning-text">{text.checkoutUnavailable}</p>}
      {!canManage && <p className="warning-text">{text.ownerOnly}</p>}

      <h2>{text.choosePlan}</h2>
      <section className={styles.planGrid}>
        {plans.map((plan) => {
          const active = billing.plan === plan.code;
          const upgrade = planRank[plan.code] > planRank[billing.plan];
          return (
            <article className={styles.planCard} key={plan.code}>
              <div>
                <h3>{plan.code}</h3>
                <strong>
                  {plan.monthlyPriceEurCents === 0
                    ? euro(0, locale)
                    : euro(plan.monthlyPriceEurCents, locale)}
                  {plan.monthlyPriceEurCents > 0 && <> / {text.monthly}</>}
                </strong>
              </div>
              <p>{text.searches(plan.monthlySupplierSearchLimit)}</p>
              {active ? (
                <span className={styles.currentBadge}>{text.current}</span>
              ) : plan.code === "FREE" || !upgrade ? null : (
                <BillingCheckoutButton
                  disabled={!checkoutConfigured || !canManage}
                  kind="SUBSCRIPTION"
                  plan={plan.code}
                />
              )}
            </article>
          );
        })}
      </section>

      <section className={styles.oneOff}>
        <div>
          <p className="eyebrow">{text.oneOffTitle}</p>
          <h2>{euro(JAKOV360_FULL_IMPORT_ANALYSIS.priceEurCents, locale)}</h2>
          <p>{text.oneOffBody}</p>
          <p>{text.oneOffIncludes}</p>
        </div>
        {project ? (
          <div>
            <p>{text.selectedProject}: <strong>{project.name}</strong></p>
            <BillingCheckoutButton
              disabled={!checkoutConfigured || !canManage}
              kind="FULL_IMPORT_ANALYSIS"
              projectId={project.id}
            />
          </div>
        ) : (
          <p className="muted-text">{text.selectProject}</p>
        )}
      </section>
    </main>
  );
}
