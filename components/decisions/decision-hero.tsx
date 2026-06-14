"use client";

import type { ProjectDecisionResult } from "@/modules/decisions/domain/project-decision";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";

type DecisionView = ProjectDecisionResult & { id: string; createdAt: Date };

const presentation = {
  READY_TO_BUY: "buy",
  NEGOTIATE_FIRST: "negotiate",
  DO_NOT_BUY: "skip",
  NEED_MORE_OFFERS: "wait",
} as const;

export function DecisionHero({ decision }: { decision: DecisionView | null }) {
  const { locale, t } = useI18n();
  if (!decision) {
    return (
      <section className="decision-hero wait">
        <div><p className="eyebrow">Preporuka</p><h2>Još nema preporuke.</h2></div>
        <p>Dodajte i ocenite ponude. ImportPilot će ovde prikazati jasnu odluku čim postoje dovoljne informacije.</p>
      </section>
    );
  }

  const view = presentation[decision.status];
  const best = decision.summarySnapshot.bestOverallOffer;
  const reason = decision.actionChecklist[0]?.reason ?? decision.decisionReason;

  return (
    <section className={`decision-hero ${view}`}>
      <div className="decision-hero-heading">
        <p className="eyebrow">ImportPilot preporuka</p>
        <h2><span aria-hidden="true">●</span> {getStatusLabel(decision.status, locale)}</h2>
        <p>{t(reason)}</p>
      </div>
      <dl className="decision-hero-metrics">
        <div><dt>Ukupan trošak</dt><dd>{best?.landedCostTotal ?? "N/A"} {best?.currency ?? ""}</dd></div>
        <div><dt>Marža</dt><dd>{best?.grossMarginPercent ?? "N/A"}%</dd></div>
        <div><dt>Rizik</dt><dd>{best?.assessment?.supplierRiskScore ?? "N/A"}/100</dd></div>
        <div><dt>Glavni razlog</dt><dd>{t(reason)}</dd></div>
      </dl>
    </section>
  );
}
