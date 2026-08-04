"use client";

import { FxSourceNote } from "@/components/fx/fx-source-note";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { ComparisonGroup } from "@/modules/intelligence/domain/comparison";
import type {
  LunaCountryRankingReason,
  LunaCountryRankingStatus,
} from "@/modules/intelligence/domain/luna-country-ranking";
import type { Locale } from "@/modules/i18n/translations";

const statusLabels: Record<Locale, Record<LunaCountryRankingStatus, string>> = {
  sr: {
    TOP_PICK: "Lunin prvi izbor",
    ALTERNATIVE: "Alternativa",
    REVIEW_REQUIRED: "Potrebna provera",
    INCOMPLETE: "Nedostaju podaci",
  },
  de: {
    TOP_PICK: "Lunas erste Wahl",
    ALTERNATIVE: "Alternative",
    REVIEW_REQUIRED: "Prüfung erforderlich",
    INCOMPLETE: "Daten fehlen",
  },
  en: {
    TOP_PICK: "Luna top pick",
    ALTERNATIVE: "Alternative",
    REVIEW_REQUIRED: "Review required",
    INCOMPLETE: "Missing data",
  },
};

const reasonLabels: Record<Locale, Record<LunaCountryRankingReason, string>> = {
  sr: {
    COUNTRY_MATCH: "Kalkulacija odgovara ciljnoj zemlji.",
    COUNTRY_MISMATCH: "Kalkulacija je urađena za drugu ciljnu zemlju.",
    CALCULATION_NEEDS_REVIEW: "Transportne ili carinske pretpostavke još zahtevaju proveru.",
    MISSING_CALCULATION: "Nedostaje potpuna landed-cost kalkulacija.",
    MISSING_ASSESSMENT: "Nedostaje procena rizika i kvaliteta ponude.",
    FX_UNAVAILABLE: "Nema referentnog kursa za pouzdano poređenje.",
    LOWEST_LANDED_COST: "Najniža stvarna cena po komadu među proverenim ponudama.",
    COST_ABOVE_BEST: "Stvarna cena po komadu je viša od najbolje proverene ponude.",
    MARGIN_AT_OR_ABOVE_TARGET: "Procenjena marža dostiže ili prelazi cilj projekta.",
    MARGIN_BELOW_TARGET: "Procenjena marža je ispod cilja projekta.",
    LOW_SUPPLIER_RISK: "Rizik dobavljača je nizak.",
    MEDIUM_SUPPLIER_RISK: "Rizik dobavljača je srednji.",
    HIGH_SUPPLIER_RISK: "Rizik dobavljača je visok.",
  },
  de: {
    COUNTRY_MATCH: "Die Kalkulation entspricht dem Zielland.",
    COUNTRY_MISMATCH: "Die Kalkulation wurde für ein anderes Zielland erstellt.",
    CALCULATION_NEEDS_REVIEW: "Transport- oder Zollannahmen müssen noch geprüft werden.",
    MISSING_CALCULATION: "Eine vollständige Importkostenkalkulation fehlt.",
    MISSING_ASSESSMENT: "Risiko- und Qualitätsbewertung fehlen.",
    FX_UNAVAILABLE: "Für einen verlässlichen Vergleich fehlt ein Referenzkurs.",
    LOWEST_LANDED_COST: "Niedrigste reale Stückkosten unter den geprüften Angeboten.",
    COST_ABOVE_BEST: "Die realen Stückkosten liegen über dem besten geprüften Angebot.",
    MARGIN_AT_OR_ABOVE_TARGET: "Die geschätzte Marge erreicht oder übertrifft das Projektziel.",
    MARGIN_BELOW_TARGET: "Die geschätzte Marge liegt unter dem Projektziel.",
    LOW_SUPPLIER_RISK: "Das Lieferantenrisiko ist niedrig.",
    MEDIUM_SUPPLIER_RISK: "Das Lieferantenrisiko ist mittel.",
    HIGH_SUPPLIER_RISK: "Das Lieferantenrisiko ist hoch.",
  },
  en: {
    COUNTRY_MATCH: "The calculation matches the target country.",
    COUNTRY_MISMATCH: "The calculation was created for a different target country.",
    CALCULATION_NEEDS_REVIEW: "Transport or customs assumptions still require review.",
    MISSING_CALCULATION: "A complete landed-cost calculation is missing.",
    MISSING_ASSESSMENT: "Risk and offer-quality assessment are missing.",
    FX_UNAVAILABLE: "A reference FX rate is unavailable for reliable comparison.",
    LOWEST_LANDED_COST: "Lowest real cost per unit among reviewed offers.",
    COST_ABOVE_BEST: "Real cost per unit is above the best reviewed offer.",
    MARGIN_AT_OR_ABOVE_TARGET: "Estimated margin meets or exceeds the project target.",
    MARGIN_BELOW_TARGET: "Estimated margin is below the project target.",
    LOW_SUPPLIER_RISK: "Supplier risk is low.",
    MEDIUM_SUPPLIER_RISK: "Supplier risk is medium.",
    HIGH_SUPPLIER_RISK: "Supplier risk is high.",
  },
};

export function ComparisonView({ groups }: { groups: ComparisonGroup[] }) {
  const { locale, t } = useI18n();
  const winner = (name: string | undefined) => name ?? t("Unavailable");

  return (
    <section className="dashboard-card">
      <h2>{t("Offer comparison")}</h2>
      <p>{t("Offers are converted to EUR for comparison while original currencies remain unchanged.")}</p>
      {groups.map((group) => (
        <div key={group.currency}>
          {group.lunaRanking.length > 0 && (
            <section>
              <header className="section-header">
                <div>
                  <h3>Luna ranking{group.targetCountry ? ` · ${group.targetCountry}` : ""}</h3>
                  <p className="muted-text">{group.lunaRankingVersion}</p>
                </div>
              </header>
              <div className="search-result-list">
                {group.lunaRanking.map((offer) => (
                  <article className="search-result-card" key={offer.offerId}>
                    <div>
                      <p className="eyebrow">
                        {offer.rank ? `#${offer.rank}` : "—"} · {statusLabels[locale][offer.status]}
                      </p>
                      <h3>{offer.supplierName}</h3>
                      {offer.score !== null && (
                        <p>
                          <strong>{offer.score}/100</strong>
                          {offer.landedCostPerUnitEur !== null
                            ? ` · ${offer.landedCostPerUnitEur.toFixed(2)} EUR / kom`
                            : ""}
                          {offer.grossMarginPercent !== null
                            ? ` · ${offer.grossMarginPercent.toFixed(2)}% ${t("Bruto marža").toLowerCase()}`
                            : ""}
                        </p>
                      )}
                      {offer.reasons.map((reason) => (
                        <p className="muted-text" key={reason}>{reasonLabels[locale][reason]}</p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="comparison-list">
            <article>
              <h3>{group.currency}</h3>
              <dl>
                <div><dt>{t("Best total cost")}</dt><dd>{winner(group.bestTotalCost?.supplierName)}</dd></div>
                <div><dt>{t("Lowest risk")}</dt><dd>{winner(group.lowestRisk?.supplierName)}</dd></div>
                <div><dt>{t("Fastest delivery")}</dt><dd>{winner(group.fastestDelivery?.supplierName)}</dd></div>
                <div><dt>{t("Best for resale")}</dt><dd>{winner(group.bestForResale?.supplierName)}</dd></div>
              </dl>
            </article>
          </div>
        </div>
      ))}
      {groups.length === 0 && (
        <div className="empty-state">
          <h3>{t("No analysis yet.")}</h3>
          <p>{t("Add at least two offers with a specified currency.")}</p>
        </div>
      )}
      <FxSourceNote />
    </section>
  );
}
