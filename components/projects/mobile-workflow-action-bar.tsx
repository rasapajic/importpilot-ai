import type { MobileWorkflowAction } from "@/modules/projects/domain/mobile-workflow-actions";

import { translateText, type Locale } from "@/modules/i18n/translations";

export function MobileWorkflowActionBar({
  actions,
  locale,
}: {
  actions: MobileWorkflowAction[];
  locale: Locale;
}) {
  if (actions.length === 0) return null;

  return (
    <nav className="mobile-workflow-action-bar" aria-label={translateText("Sledeće akcije", locale)}>
      {actions.map((action) => (
        <a
          className={action.variant === "PRIMARY" ? "mobile-primary-action" : "mobile-secondary-action"}
          href={action.href}
          key={`${action.label}-${action.href}`}
        >
          {action.label === "Dodaj ponudu" && <span aria-hidden="true">+</span>}
          {translateText(action.label, locale)}
        </a>
      ))}
    </nav>
  );
}
