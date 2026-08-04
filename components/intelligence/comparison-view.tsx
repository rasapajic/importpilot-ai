"use client";

import { FxSourceNote } from "@/components/fx/fx-source-note";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getLunaRankingCopy } from "@/components/intelligence/luna-ranking-copy";
import type { ComparisonGroup } from "@/modules/intelligence/domain/comparison";
import type { LunaRankedOffer } from "@/modules/intelligence/domain/luna-ranking";
import { getStatusLabel } from "@/modules/i18n/translations";

function formatNumber(value: number | null, digits = 2) {
  return value === null ? "—" : value.toFixed(digits);
}

export function ComparisonView({ groups }: { groups: ComparisonGroup[] }) {
  const { locale, t } = useI18n();
  const copy = getLunaRankingCopy(locale);
  const winner = (name: string | undefined) => name ?? t("Unavailable");
  const ranking = groups[0]?.lunaRanking;

  function rankingCard(offer: LunaRankedOffer) {
    return (
      <article className="offer-card" key={offer.offerId}>
        <header>
          <strong>{offer.rank ? `#${offer.rank} · ` : ""}{offer.supplierName}</strong>
          <span className={`provider-status provider-status-${offer.status === "RANKED" ? "connected" : "not_configured"}`}>
            {offer.status}
          </span>
        </header>
        <div className="offer-highlights">
          <span>
            {copy.landedCostPerUnit}
            <strong>{offer.landedCostPerUnitEur === null ? "—" : `≈ ${formatNumber(offer.landedCostPerUnitEur)} EUR`}</strong>
          </span>
          <span>
            {copy.margin}
            <strong>{offer.grossMarginPercent === null ? "—" : `${formatNumber(offer.grossMarginPercent)}%`}</strong>
          </span>
          <span>
            {copy.risk}
            <strong>{offer.supplierRiskScore === null ? "—" : `${offer.supplierRiskScore}/100`}</strong>
          </span>
          <span>
            {copy.recommendation}
            <strong>{offer.recommendationStatus ? getStatusLabel(offer.recommendationStatus, locale) : "—"}</strong>
          </span>
        </div>
        <ul>
          {offer.reasonCodes.map((reason) => <li key={reason}>{copy.reasons[reason]}</li>)}
          {offer.missingData.map((missing) => <li key={missing}>{copy.missing[missing]}</li>)}
        </ul>
      </article>
    );
  }

  return (
    <section className="dashboard-card">
      <h2>{copy.title}</h2>
      <p>{copy.description}</p>

      {ranking && (
        <div className="comparison-list">
          <section>
            <h3>{copy.confirmed}</h3>
            <div className="offer-list">
              {ranking.ranked.map(rankingCard)}
              {ranking.ranked.length === 0 && <p className="muted-text">{copy.noConfirmed}</p>}
            </div>
          </section>

          {ranking.needsReview.length > 0 && (
            <section>
              <h3>{copy.needsReview}</h3>
              <div className="offer-list">{ranking.needsReview.map(rankingCard)}</div>
            </section>
          )}

          {ranking.notReady.length > 0 && (
            <section>
              <h3>{copy.notReady}</h3>
              <div className="offer-list">{ranking.notReady.map(rankingCard)}</div>
            </section>
          )}
        </div>
      )}

      <details>
        <summary><strong>{t("Offer comparison")}</strong></summary>
        <p>{t("Offers are converted to EUR for comparison while original currencies remain unchanged.")}</p>
        <div className="comparison-list">
          {groups.map((group) => (
            <article key={group.currency}>
              <h3>{group.currency}</h3>
              <dl>
                <div><dt>{t("Best total cost")}</dt><dd>{winner(group.bestTotalCost?.supplierName)}</dd></div>
                <div><dt>{t("Lowest risk")}</dt><dd>{winner(group.lowestRisk?.supplierName)}</dd></div>
                <div><dt>{t("Fastest delivery")}</dt><dd>{winner(group.fastestDelivery?.supplierName)}</dd></div>
                <div><dt>{t("Best for resale")}</dt><dd>{winner(group.bestForResale?.supplierName)}</dd></div>
              </dl>
            </article>
          ))}
          {groups.length === 0 && <div className="empty-state"><h3>{t("No analysis yet.")}</h3><p>{t("Add at least two offers with a specified currency.")}</p></div>}
        </div>
      </details>
      <FxSourceNote />
    </section>
  );
}
