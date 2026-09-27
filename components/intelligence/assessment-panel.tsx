"use client";

import type { OfferAssessment } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";
import { recommendationBadgeStatus } from "@/modules/intelligence/application/recommendation-display";
import { hasReliableDetailedAssessment } from "@/modules/intelligence/domain/assessment-reliability";

type AssessmentBreakdown = {
  moq?: { status: string; label: string; message: string };
  supplierRiskV2?: {
    riskScore: number;
    riskLevel: string;
    reasons: string[];
  };
};

function assessmentBreakdown(assessment: OfferAssessment): AssessmentBreakdown {
  if (!assessment.scoreBreakdown || typeof assessment.scoreBreakdown !== "object" || Array.isArray(assessment.scoreBreakdown)) {
    return {};
  }
  return assessment.scoreBreakdown as AssessmentBreakdown;
}

function riskLabel(level: string | undefined) {
  if (level === "LOW") return "Nizak rizik";
  if (level === "MEDIUM") return "Srednji rizik";
  if (level === "HIGH") return "Visok rizik";
  return "Rizik nepoznat";
}

function confidenceLabel(score: number) {
  if (score >= 70) return "Visoka";
  if (score >= 40) return "Srednja";
  return "Niska";
}

export function AssessmentPanel({
  offerId,
  assessments,
  calculationReady = false,
}: {
  offerId: string;
  assessments: OfferAssessment[];
  calculationReady?: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const latest = assessments[0];
  const breakdown = latest ? assessmentBreakdown(latest) : {};
  const detailedScoresReliable = latest ? hasReliableDetailedAssessment({
    confidenceScore: Number(latest.confidenceScore),
    scoreBreakdown: latest.scoreBreakdown,
  }) : false;

  async function assess() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/offers/${offerId}/assessments`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? t("Analiza ponude nije završena. Pokušajte ponovo."));
      else router.refresh();
    } catch {
      setError("Veza sa serverom nije dostupna. Pokušajte ponovo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="assessment-panel">
      <header className="section-header">
        <h3>{t("Analiza ponude")}</h3>
        <button className="secondary-button" disabled={pending} onClick={assess} type="button">
          {pending ? t("Analiza je u toku...") : latest ? t("Ponovo analiziraj ponudu") : t("Analiziraj ponudu")}
        </button>
      </header>
      {error && <p className="form-error">{error}</p>}
      {latest ? (
        <>
          <div className="recommendation-summary">
            {calculationReady ? t("Preporuka") : t("Status")}
            <strong>{calculationReady ? getStatusLabel(recommendationBadgeStatus(latest.recommendationStatus), locale) : t("Nije moguće proceniti isplativost")}</strong>
          </div>
          <p>{calculationReady ? t(latest.explanation) : t("Prikazana je samo privremena procena rizika. Potvrdite troškove za konačnu preporuku.")}</p>
          <details>
            <summary>Prikaži detaljnu analizu</summary>
            <div className="score-grid assessment-scores">
              {detailedScoresReliable ? (
                <>
                  <span>{t("Ukupna ocena")}<strong>{latest.overallScore}/100</strong></span>
                  <span>{t("Rizik")}<strong>{latest.supplierRiskScore}/100</strong></span>
                  <span>{t("Kvalitet")}<strong>{latest.offerQualityScore}/100</strong></span>
                </>
              ) : (
                <span className="assessment-score-unavailable">{t("Nije moguće pouzdano oceniti")}</span>
              )}
              <span>{t("Pouzdanost")}<strong>{latest.confidenceScore.toString()}% — {t(confidenceLabel(Number(latest.confidenceScore)))}</strong></span>
            </div>
            <div className="assessment-risk-detail">
              <p><strong>{t("Rizik dobavljača")}:</strong> {t(riskLabel(breakdown.supplierRiskV2?.riskLevel))}</p>
              {breakdown.supplierRiskV2?.reasons?.length ? (
                <ul>
                  {breakdown.supplierRiskV2.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{t(reason)}</li>
                  ))}
                </ul>
              ) : null}
              {breakdown.moq?.status === "BLOCKING" && (
                <p className="form-error">{t(breakdown.moq.message)}</p>
              )}
            </div>
          </details>
          <details>
            <summary>{t("Istorija analiza")} ({assessments.length})</summary>
            <ul>
              {assessments.map((assessment) => {
                const reliable = hasReliableDetailedAssessment({
                  confidenceScore: Number(assessment.confidenceScore),
                  scoreBreakdown: assessment.scoreBreakdown,
                });
                return (
                  <li key={assessment.id}>
                    {assessment.createdAt.toLocaleString(locale)} · {calculationReady ? getStatusLabel(assessment.recommendationStatus, locale) : t("Privremena procena")} · {reliable ? `${assessment.overallScore}/100` : t("Nije moguće pouzdano oceniti")} · {assessment.assessmentVersion}
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      ) : (
        <p>{t("Ponuda još nije analizirana.")}</p>
      )}
    </div>
  );
}
