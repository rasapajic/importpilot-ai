import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";

type GoogleAuthFeedbackProps = {
  code?: string;
};

const messages: Record<Locale, Record<string, string>> = {
  sr: {
    "not-configured": "Google prijava još nije podešena na ovom okruženju.",
    cancelled: "Google prijava je otkazana.",
    "invalid-state": "Google prijava nije mogla bezbedno da se potvrdi. Pokušajte ponovo.",
    "start-failed": "Google prijava trenutno nije dostupna. Pokušajte ponovo.",
    failed: "Google prijava nije završena. Pokušajte ponovo ili koristite email i lozinku.",
  },
  de: {
    "not-configured": "Google-Anmeldung ist in dieser Umgebung noch nicht eingerichtet.",
    cancelled: "Google-Anmeldung wurde abgebrochen.",
    "invalid-state": "Die Google-Anmeldung konnte nicht sicher bestätigt werden. Bitte versuchen Sie es erneut.",
    "start-failed": "Google-Anmeldung ist derzeit nicht verfügbar. Bitte versuchen Sie es erneut.",
    failed: "Google-Anmeldung konnte nicht abgeschlossen werden. Versuchen Sie es erneut oder verwenden Sie E-Mail und Passwort.",
  },
  en: {
    "not-configured": "Google sign-in is not configured in this environment yet.",
    cancelled: "Google sign-in was cancelled.",
    "invalid-state": "Google sign-in could not be verified safely. Please try again.",
    "start-failed": "Google sign-in is currently unavailable. Please try again.",
    failed: "Google sign-in could not be completed. Try again or use email and password.",
  },
};

export async function GoogleAuthFeedback({ code }: GoogleAuthFeedbackProps) {
  if (!code) return null;
  const locale = await getServerLocale();
  const message = messages[locale][code] ?? messages[locale].failed;
  return <p className="form-error" role="alert">{message}</p>;
}
