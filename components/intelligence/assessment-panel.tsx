"use client";

import type { OfferAssessment } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";
import { recommendationBadgeStatus } from "@/modules/intelligence/application/recommendation-display";

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

export function AssessmentPanel({
  offerId,
  assessments,
}: {
  offerId: string;
  assessments: OfferAssessment[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const latest = assessments[0];
  const breakdown = latest ? assessmentBreakdown(latest) : {};

  async function assess() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/offers/${offerId}/assessments`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? "Ocena ponude nije završena. Pokušajte ponovo.");
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
          {pending ? "Ocenjivanje..." : latest ? "Ponovo oceni" : "Oceni ponudu"}
        </button>
      </header>
      {error && <p className="form-error">{error}</p>}
      {latest ? (
        <>
          <div className="recommendation-summary">Preporuka<strong>{getStatusLabel(recommendationBadgeStatus(latest.recommendationStatus), locale)}</strong></div>
          <p>{t(latest.explanation)}</p>
          <details>
            <summary>Prikaži detaljnu analizu</summary>
            <div className="score-grid assessment-scores">
              <span>Ukupna ocena<strong>{latest.overallScore}/100</strong></span>
              <span>Rizik<strong>{latest.supplierRiskScore}/100</strong></span>
              <span>Kvalitet<strong>{latest.offerQualityScore}/100</strong></span>
              <span>Pouzdanost<strong>{latest.confidenceScore.toString()}%</strong></span>
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
            <summary>Istorija procena ({assessments.length})</summary>
            <ul>
              {assessments.map((assessment) => (
                <li key={assessment.id}>
                  {assessment.createdAt.toLocaleString(locale)} · {getStatusLabel(assessment.recommendationStatus, locale)} · {assessment.overallScore}/100 · {assessment.assessmentVersion}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p>Ponuda još nije ocenjena.</p>
      )}
    </div>
  );
}
