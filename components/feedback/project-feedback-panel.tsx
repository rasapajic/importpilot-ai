"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";

type HistoryItem = { id: string; label: string; detail?: string; createdAt: string };

export function ProjectFeedbackPanel({
  projectId,
  completionStatus,
  hasDecision,
  outcomeHistory,
  feedbackHistory,
  completionHistory,
}: {
  projectId: string;
  completionStatus: string;
  hasDecision: boolean;
  outcomeHistory: HistoryItem[];
  feedbackHistory: HistoryItem[];
  completionHistory: HistoryItem[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");

  async function post(path: string, body: object) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? "Podatak nije sačuvan. Pokušajte ponovo.");
      else router.refresh();
    } catch {
      setError("Veza sa serverom nije dostupna. Pokušajte ponovo.");
    } finally {
      setPending(false);
    }
  }

  function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    post("outcomes", {
      outcome: data.outcome,
      finalPrice: data.finalPrice || undefined,
      finalCurrency: data.finalCurrency || undefined,
      purchaseSuccessful:
        data.purchaseSuccessful === "" ? undefined : data.purchaseSuccessful === "true",
      comment: data.comment || undefined,
    });
  }

  return (
    <section className="dashboard-card feedback-panel">
      <header className="section-header">
        <div><p className="eyebrow">{t("Povratne informacije i analitika")}</p><h2>Kako se projekat završio?</h2></div>
        <form className="completion-form" onSubmit={(event) => {
          event.preventDefault();
          post("completion", Object.fromEntries(new FormData(event.currentTarget).entries()));
        }}>
          <select defaultValue={completionStatus} name="status">
            <option value="ACTIVE">{getStatusLabel("ACTIVE", locale)}</option>
            <option value="DECIDED">{getStatusLabel("DECIDED", locale)}</option>
            <option value="COMPLETED">{getStatusLabel("COMPLETED", locale)}</option>
            <option value="ARCHIVED">{getStatusLabel("ARCHIVED", locale)}</option>
          </select>
          <button className="secondary-button" disabled={pending} type="submit">Sačuvaj status</button>
        </form>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="feedback-grid">
        <form className="feedback-form" onSubmit={submitOutcome}>
          <h3>{t("Ishod projekta")}</h3>
          <label>Ishod<select name="outcome">
            <option value="BOUGHT">{getStatusLabel("BOUGHT", locale)}</option>
            <option value="NEGOTIATED">{getStatusLabel("NEGOTIATED", locale)}</option>
            <option value="ABANDONED">{getStatusLabel("ABANDONED", locale)}</option>
            <option value="POSTPONED">{getStatusLabel("POSTPONED", locale)}</option>
          </select></label>
          <label>Konačna cena<input min="0.0001" name="finalPrice" step="0.0001" type="number" /></label>
          <label>Valuta<input maxLength={3} name="finalCurrency" placeholder="EUR" /></label>
          <label>Da li je kupovina uspela?<select name="purchaseSuccessful"><option value="">Nije navedeno</option><option value="true">Da</option><option value="false">Ne</option></select></label>
          <label>Komentar<textarea maxLength={2000} name="comment" /></label>
          <button disabled={pending} type="submit">Zabeleži ishod</button>
        </form>
        <div>
          <h3>Da li vam je ova preporuka bila korisna?</h3>
          <label className="feedback-comment">Opcioni komentar<textarea maxLength={2000} onChange={(event) => setFeedbackComment(event.target.value)} value={feedbackComment} /></label>
          <div className="actions">
            <button disabled={!hasDecision || pending} onClick={() => post("recommendation-feedback", { vote: "HELPFUL", comment: feedbackComment || undefined })} type="button">Da</button>
            <button className="secondary-button" disabled={!hasDecision || pending} onClick={() => post("recommendation-feedback", { vote: "NOT_HELPFUL", comment: feedbackComment || undefined })} type="button">Ne</button>
          </div>
          {!hasDecision && <p>Prvo generišite finalnu preporuku projekta.</p>}
          <h3>Poslednji zapisi</h3>
          <ul className="feedback-history">
            {[...outcomeHistory, ...feedbackHistory, ...completionHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((item) => (
              <li key={item.id}><strong>{getStatusLabel(item.label, locale)}</strong>{item.detail && <span>{t(item.detail)}</span>}<time>{new Date(item.createdAt).toLocaleString(locale)}</time></li>
            ))}
          </ul>
          {outcomeHistory.length + feedbackHistory.length + completionHistory.length === 0 && <p>{t("Još nema zapisa o ishodu, povratnim informacijama ili završetku.")}</p>}
        </div>
      </div>
    </section>
  );
}
