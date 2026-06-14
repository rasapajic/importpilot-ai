"use client";

import type { ProjectActivity, ProjectActivityType } from "@prisma/client";
import { useI18n } from "@/components/i18n/i18n-provider";

const labels: Record<ProjectActivityType, string> = {
  PROJECT_CREATED: "Projekat kreiran",
  OFFER_ADDED: "Ponuda dodata",
  LANDED_COST_CALCULATED: "Ukupna nabavna cena izračunata",
  ASSESSMENT_COMPLETED: "Procena završena",
  FINAL_DECISION_CREATED: "Finalna odluka",
  NEGOTIATION_MESSAGE_GENERATED: "Poruka generisana",
  NEGOTIATION_MESSAGE_SENT: "Poruka poslata",
  DOCUMENT_UPLOADED: "Dokument otpremljen",
  DOCUMENT_DELETED: "Dokument obrisan",
  PROJECT_OUTCOME_RECORDED: "Ishod projekta",
  RECOMMENDATION_FEEDBACK_RECORDED: "Feedback preporuke",
  PROJECT_COMPLETION_CHANGED: "Status završetka",
};

export function ProjectTimeline({
  activities,
  selectedType,
}: {
  activities: ProjectActivity[];
  selectedType?: ProjectActivityType;
}) {
  const { locale, t } = useI18n();
  const visibleActivities = activities.slice(0, 5);

  return (
    <details className="dashboard-card timeline-panel">
      <summary>
        <span><span className="eyebrow">Istorija rada</span><strong>Istorija ({visibleActivities.length} događaja)</strong></span>
      </summary>
      <form method="get">
        <select defaultValue={selectedType ?? ""} name="activityType">
          <option value="">Svi događaji</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>{t(label)}</option>
          ))}
        </select>
        <button className="secondary-button" type="submit">Filtriraj</button>
      </form>
      <ol className="timeline-list">
        {visibleActivities.map((activity) => (
          <li key={activity.id}>
            <div className="timeline-marker" />
            <div>
              <strong>{t(activity.title)}</strong>
              {activity.description && <p>{t(activity.description)}</p>}
              <time dateTime={activity.createdAt.toISOString()}>
                {activity.createdAt.toLocaleString(locale)}
              </time>
            </div>
          </li>
        ))}
      </ol>
      {activities.length === 0 && <div className="empty-state"><h3>Nema događaja za izabrani filter.</h3><p>Izaberite drugi tip događaja ili nastavite rad na projektu.</p></div>}
    </details>
  );
}
