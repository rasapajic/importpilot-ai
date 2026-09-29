import Link from "next/link";

import { translateText, type Locale } from "@/modules/i18n/translations";
import {
  getProjectStepHref,
  projectStepIds,
  projectStepLabels,
  type ProjectStepId,
} from "@/modules/projects/domain/project-step-routes";

export function ProjectStepNavigation({
  projectId,
  currentStep,
  completedSteps,
  locale,
}: {
  projectId: string;
  currentStep: ProjectStepId;
  completedSteps: ProjectStepId[];
  locale: Locale;
}) {
  return (
    <nav className="project-step-navigation" aria-label={translateText("Koraci kupovine", locale)}>
      <ol>
        {projectStepIds.map((step, index) => {
          const active = step === currentStep;
          const completed = completedSteps.includes(step);
          return (
            <li className={active ? "project-step-link-active" : completed ? "project-step-link-completed" : ""} key={step}>
              <Link aria-current={active ? "step" : undefined} href={getProjectStepHref(projectId, step)}>
                <span>{index + 1}</span>
                <strong>{translateText(projectStepLabels[step], locale)}</strong>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
