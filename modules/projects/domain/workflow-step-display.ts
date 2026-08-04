import type { Locale } from "../../i18n/translations";
import type { ProjectWorkflowStepStatus } from "./project-workflow";

type WorkflowStepDisplay = {
  title: string;
  badge: string;
};

function resolveLocale(locale: Locale | string): Locale {
  return locale === "de" || locale === "sr" ? locale : "en";
}

const productCopy: Record<Locale, { activeTitle: string; completedTitle: string; activeBadge: string; completedBadge: string; lockedBadge: string }> = {
  sr: {
    activeTitle: "Šta želite da kupite?",
    completedTitle: "Odabrani proizvod",
    activeBadge: "IZABERI PROIZVOD",
    completedBadge: "ODABRANO",
    lockedBadge: "ZAKLJUČANO",
  },
  de: {
    activeTitle: "Was möchten Sie kaufen?",
    completedTitle: "Ausgewähltes Produkt",
    activeBadge: "PRODUKT AUSWÄHLEN",
    completedBadge: "AUSGEWÄHLT",
    lockedBadge: "GESPERRT",
  },
  en: {
    activeTitle: "What do you want to buy?",
    completedTitle: "Selected product",
    activeBadge: "SELECT PRODUCT",
    completedBadge: "SELECTED",
    lockedBadge: "LOCKED",
  },
};

const offerCopy: Record<Locale, { title: string; activeBadge: string; completedBadge: string; lockedBadge: string }> = {
  sr: {
    title: "Ponude dobavljača",
    activeBadge: "DODAJ PONUDU",
    completedBadge: "PONUDE DODATE",
    lockedBadge: "ZAKLJUČANO",
  },
  de: {
    title: "Lieferantenangebote",
    activeBadge: "ANGEBOT HINZUFÜGEN",
    completedBadge: "ANGEBOTE HINZUGEFÜGT",
    lockedBadge: "GESPERRT",
  },
  en: {
    title: "Supplier offers",
    activeBadge: "ADD OFFER",
    completedBadge: "OFFERS ADDED",
    lockedBadge: "LOCKED",
  },
};

const decisionBadgeCopy: Record<Locale, { active: string; completed: string; locked: string }> = {
  sr: {
    active: "PROVERI ISPLATIVOST",
    completed: "ODLUKA DONETA",
    locked: "ZAKLJUČANO",
  },
  de: {
    active: "RENTABILITÄT PRÜFEN",
    completed: "ENTSCHEIDUNG GETROFFEN",
    locked: "GESPERRT",
  },
  en: {
    active: "CHECK PROFITABILITY",
    completed: "DECISION MADE",
    locked: "LOCKED",
  },
};

function badgeForStatus(
  status: ProjectWorkflowStepStatus,
  copy: { active: string; completed: string; locked: string },
) {
  if (status === "COMPLETED") return copy.completed;
  if (status === "ACTIVE") return copy.active;
  return copy.locked;
}

export function getProductStepDisplay(
  status: ProjectWorkflowStepStatus,
  locale: Locale | string,
): WorkflowStepDisplay {
  const text = productCopy[resolveLocale(locale)];
  return {
    title: status === "COMPLETED" ? text.completedTitle : text.activeTitle,
    badge: badgeForStatus(status, {
      active: text.activeBadge,
      completed: text.completedBadge,
      locked: text.lockedBadge,
    }),
  };
}

export function getOfferStepDisplay(
  status: ProjectWorkflowStepStatus,
  locale: Locale | string,
): WorkflowStepDisplay {
  const text = offerCopy[resolveLocale(locale)];
  return {
    title: text.title,
    badge: badgeForStatus(status, {
      active: text.activeBadge,
      completed: text.completedBadge,
      locked: text.lockedBadge,
    }),
  };
}

export function getDecisionStepBadge(
  status: ProjectWorkflowStepStatus,
  locale: Locale | string,
) {
  const text = decisionBadgeCopy[resolveLocale(locale)];
  return badgeForStatus(status, text);
}
