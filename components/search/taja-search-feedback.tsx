"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import {
  TajaPriceSignalStatuses,
  type TajaPriceSignal,
} from "@/modules/product-search/domain/taja-price-signal";
import {
  TajaRequirementMatchStatuses,
  type TajaRequirementCheck,
  type TajaRequirementMatch,
} from "@/modules/product-search/domain/taja-requirement-match";

const copy = {
  sr: {
    loading: "Taja trenutno pretražuje i analizira ponude. Nemojte zatvarati ili osvežavati stranicu.",
    title: "Usklađenost sa zahtevom",
    status: {
      FULL: "potpuna prema trenutno potvrđenim podacima",
      PARTIAL: "delimična",
      UNCONFIRMED: "nije potvrđena",
      NOT_EVALUATED: "nije procenjena",
    },
    confirmed: "potvrđeno",
    unconfirmed: "nije potvrđeno",
    priceWarningTitle: "Cenovni ekstrem",
    highPriceWarning: "Prikazana cena je višestruko viša od drugih ponuda u istoj valuti. Proverite da li je cena po komadu, za kompletan industrijski sistem ili za drugu količinsku jedinicu.",
    lowPriceWarning: "Prikazana cena je neuobičajeno niska u odnosu na druge ponude u istoj valuti. Proverite da li je cena početna, za deo seta ili za drugu količinsku jedinicu.",
    requirement: {
      MISTING: "vodena magla / misting sistem",
      PATIO: "namena za terasu",
      PUMP: "pumpa",
      NOZZLES: "mlaznice",
      NOZZLE_COUNT: (count: number) => `${count} mlaznica`,
    },
  },
  de: {
    loading: "Taja durchsucht und analysiert derzeit Angebote. Bitte schließen oder aktualisieren Sie die Seite nicht.",
    title: "Übereinstimmung mit den Anforderungen",
    status: {
      FULL: "vollständig nach den derzeit bestätigten Angaben",
      PARTIAL: "teilweise",
      UNCONFIRMED: "nicht bestätigt",
      NOT_EVALUATED: "nicht bewertet",
    },
    confirmed: "bestätigt",
    unconfirmed: "nicht bestätigt",
    priceWarningTitle: "Preislicher Ausreißer",
    highPriceWarning: "Der angezeigte Preis ist um ein Vielfaches höher als vergleichbare Angebote in derselben Währung. Prüfen Sie, ob er pro Stück, für ein komplettes Industriesystem oder für eine andere Mengeneinheit gilt.",
    lowPriceWarning: "Der angezeigte Preis ist im Vergleich zu anderen Angeboten in derselben Währung ungewöhnlich niedrig. Prüfen Sie, ob es sich um einen Einstiegspreis, nur einen Teil des Sets oder eine andere Mengeneinheit handelt.",
    requirement: {
      MISTING: "Wassernebel-/Misting-System",
      PATIO: "für Terrasse geeignet",
      PUMP: "Pumpe",
      NOZZLES: "Düsen",
      NOZZLE_COUNT: (count: number) => `${count} Düsen`,
    },
  },
  en: {
    loading: "Taja is currently searching and analyzing offers. Do not close or refresh the page.",
    title: "Match to your requirements",
    status: {
      FULL: "full based on currently confirmed data",
      PARTIAL: "partial",
      UNCONFIRMED: "not confirmed",
      NOT_EVALUATED: "not evaluated",
    },
    confirmed: "confirmed",
    unconfirmed: "not confirmed",
    priceWarningTitle: "Price outlier",
    highPriceWarning: "The displayed price is several times higher than comparable offers in the same currency. Verify whether it is per unit, for a complete industrial system, or for a different quantity basis.",
    lowPriceWarning: "The displayed price is unusually low compared with other offers in the same currency. Verify whether it is a starting price, only part of the kit, or based on a different quantity unit.",
    requirement: {
      MISTING: "water mist / misting system",
      PATIO: "patio use",
      PUMP: "pump",
      NOZZLES: "nozzles",
      NOZZLE_COUNT: (count: number) => `${count} nozzles`,
    },
  },
} as const;

function requirementLabel(
  localeCopy: (typeof copy)[keyof typeof copy],
  check: TajaRequirementCheck,
) {
  if (check.key === "NOZZLE_COUNT") {
    return localeCopy.requirement.NOZZLE_COUNT(check.expectedNumber ?? 0);
  }
  return localeCopy.requirement[check.key];
}

export function TajaSearchLoadingNotice() {
  const { locale } = useI18n();
  return (
    <p className="taja-search-wait-note" role="status">
      {copy[locale].loading}
    </p>
  );
}

export function TajaRequirementMatchPanel({
  match,
}: {
  match: TajaRequirementMatch;
}) {
  const { locale } = useI18n();
  if (match.status === TajaRequirementMatchStatuses.NOT_EVALUATED) return null;
  const localeCopy = copy[locale];

  return (
    <div className={`taja-requirement-match taja-requirement-match-${match.status.toLowerCase()}`}>
      <p>
        <strong>{localeCopy.title}:</strong>{" "}
        {localeCopy.status[match.status]}
      </p>
      <ul>
        {match.checks.map((check) => (
          <li
            className={check.confirmed ? "requirement-confirmed" : "requirement-unconfirmed"}
            key={`${check.key}-${check.expectedNumber ?? "feature"}`}
          >
            <span aria-hidden="true">{check.confirmed ? "✓" : "○"}</span>
            <span>{requirementLabel(localeCopy, check)}</span>
            <small>{check.confirmed ? localeCopy.confirmed : localeCopy.unconfirmed}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TajaPriceSignalWarning({ signal }: { signal: TajaPriceSignal }) {
  const { locale } = useI18n();
  if (
    signal.status !== TajaPriceSignalStatuses.HIGH_OUTLIER &&
    signal.status !== TajaPriceSignalStatuses.LOW_OUTLIER
  ) {
    return null;
  }
  const localeCopy = copy[locale];
  const message = signal.status === TajaPriceSignalStatuses.HIGH_OUTLIER
    ? localeCopy.highPriceWarning
    : localeCopy.lowPriceWarning;

  return (
    <div className="taja-price-warning" role="note">
      <strong>{localeCopy.priceWarningTitle}:</strong> {message}
    </div>
  );
}
