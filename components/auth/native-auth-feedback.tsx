import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";

type NativeAuthFeedbackProps = {
  code?: string;
};

const messages: Record<Locale, Record<string, string>> = {
  sr: {
    invalid: "Email, lozinka ili podaci naloga nisu ispravni.",
    exists: "Nalog sa ovom email adresom već postoji.",
    "rate-limited": "Previše pokušaja. Pokušajte ponovo kasnije.",
    forbidden: "Zahtev nije dozvoljen. Osvežite stranicu i pokušajte ponovo.",
    unavailable: "Registracija ili prijava trenutno nije dostupna. Pokušajte ponovo.",
  },
  de: {
    invalid: "E-Mail, Passwort oder Kontodaten sind ungültig.",
    exists: "Ein Konto mit dieser E-Mail-Adresse existiert bereits.",
    "rate-limited": "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
    forbidden: "Die Anfrage ist nicht zulässig. Laden Sie die Seite neu und versuchen Sie es erneut.",
    unavailable: "Registrierung oder Anmeldung ist derzeit nicht verfügbar. Bitte versuchen Sie es erneut.",
  },
  en: {
    invalid: "Email, password, or account details are invalid.",
    exists: "An account with this email address already exists.",
    "rate-limited": "Too many attempts. Please try again later.",
    forbidden: "The request is not allowed. Refresh the page and try again.",
    unavailable: "Registration or sign-in is currently unavailable. Please try again.",
  },
};

export async function NativeAuthFeedback({ code }: NativeAuthFeedbackProps) {
  if (!code) return null;
  const locale = await getServerLocale();
  const message = messages[locale][code] ?? messages[locale].unavailable;
  return <p className="form-error" role="alert">{message}</p>;
}
