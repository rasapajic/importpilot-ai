"use client";

import type { OfferComparison } from "@/modules/intelligence/domain/comparison";
import { FxSourceNote } from "@/components/fx/fx-source-note";
import { useI18n } from "@/components/i18n/i18n-provider";

export function ComparisonView({ comparison }: { comparison: OfferComparison }) {
  const { t } = useI18n();
  const { groups } = comparison;
  const comparableGroups = groups.filter((group) => group.offers.length >= 2);
  const winner = (name: string | undefined) => name ?? t("Unavailable");
  return (
    <section className="dashboard-card">
      <h2>{t("Offer comparison")}</h2>
      <p>{t("Ponude se rangiraju samo kada postoje najmanje dve potvrđene ponude u istoj valuti.")}</p>
      <div className="comparison-list">
        {comparableGroups.map((group) => (
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
        {comparableGroups.length === 0 && (
          <div className="empty-state">
            <h3>{t("Nema dovoljno uporedivih ponuda.")}</h3>
            <p>{t("Potrebne su najmanje dve potvrđene ponude u istoj valuti.")}</p>
          </div>
        )}
      </div>
      {comparison.excluded.length > 0 && (
        <details>
          <summary>{t("Isključene ponude")}</summary>
          <ul>
            {comparison.excluded.map((offer) => (
              <li key={offer.offerId}><strong>{offer.supplierName}</strong>: {offer.reasons.map((reason) => t(reason)).join(" ")}</li>
            ))}
          </ul>
        </details>
      )}
      <FxSourceNote />
    </section>
  );
}
