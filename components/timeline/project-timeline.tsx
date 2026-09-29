"use client";

import type { ProjectActivity, ProjectActivityType } from "@prisma/client";
import { useI18n } from "@/components/i18n/i18n-provider";
import { containsInternalAcceptanceText } from "@/modules/projects/domain/public-demo-text";

const labels: Record<ProjectActivityType, string> = {
  PROJECT_CREATED: "Projekat kreiran",
  OFFER_ADDED: "Ponuda dodata",
  LANDED_COST_CALCULATED: "Ukupna nabavna cena izračunata",
  ASSESSMENT_COMPLETED: "Ponuda je analizirana",
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
  const numberLocale = locale === "sr" ? "sr-Latn" : locale;

  return (
    <details className="dashboard-card timeline-panel">
      <summary>
        <span><span className="eyebrow">{t("Istorija rada")}</span><strong>{t("Istorija")} ({visibleActivities.length} {t("događaja")})</strong></span>
      </summary>
      <form method="get">
        <select defaultValue={selectedType ?? ""} name="activityType">
          <option value="">{t("Svi događaji")}</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>{t(label)}</option>
          ))}
        </select>
        <button className="secondary-button" type="submit">{t("Filtriraj")}</button>
      </form>
      <ol className="timeline-list">
        {visibleActivities.map((activity) => {
          const hideInternalTitle = containsInternalAcceptanceText(activity.title);
          const hideInternalDescription = containsInternalAcceptanceText(activity.description);
          return <li key={activity.id}>
            <div className="timeline-marker" />
            <div>
              <strong>{t(hideInternalTitle ? labels[activity.type] : activity.title)}</strong>
              {activity.description && !hideInternalDescription && <p>{t(activity.description)}</p>}
              <time dateTime={activity.createdAt.toISOString()}>
                {activity.createdAt.toLocaleString(numberLocale)}
              </time>
            </div>
          </li>;
        })}
      </ol>
      {activities.length === 0 && <div className="empty-state"><h3>{t("Nema događaja za izabrani filter.")}</h3><p>{t("Izaberite drugi tip događaja ili nastavite rad na projektu.")}</p></div>}
    </details>
  );
}
