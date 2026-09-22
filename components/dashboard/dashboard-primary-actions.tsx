"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";

import styles from "./dashboard-primary-actions.module.css";

type IntakeCopy = {
  productLabel: string;
  productPlaceholder: string;
  destination: string;
  destinationPrompt: string;
  germany: string;
  austria: string;
  serbia: string;
  quantity: string;
  create: string;
  creating: string;
  createFailed: string;
  quotaUsage: (plan: string, used: number, limit: number) => string;
  quotaExhausted: string;
  managePlan: string;
  voiceStart: string;
  voiceStop: string;
  voiceListening: string;
  voiceUnavailable: string;
  voiceError: string;
};

const copy: Record<Locale, IntakeCopy> = {
  sr: {
    productLabel: "Proizvod",
    productPlaceholder: "npr. USB-C 100W kabl",
    destination: "Destinacija",
    destinationPrompt: "Izaberite zemlju",
    germany: "Nemačka",
    austria: "Austrija",
    serbia: "Srbija",
    quantity: "Količina",
    create: "Pronađi najbolje ponude",
    creating: "Pretraga se pokreće...",
    createFailed: "Pretraga nije kreirana. Pokušajte ponovo.",
    quotaUsage: (plan, used, limit) => `${plan} · ${used}/${limit} živih pretraga iskorišćeno ovog meseca`,
    quotaExhausted: "Mesečni limit je potrošen. Sačuvane pretrage ostaju dostupne.",
    managePlan: "Plan i naplata",
    voiceStart: "Govorni unos",
    voiceStop: "Zaustavi",
    voiceListening: "Slušam...",
    voiceUnavailable: "Govorni unos nije podržan u ovom pregledaču.",
    voiceError: "Govor nije mogao da se prepozna. Pokušajte ponovo.",
  },
  de: {
    productLabel: "Produkt",
    productPlaceholder: "z. B. USB-C 100W Kabel",
    destination: "Zielland",
    destinationPrompt: "Land auswählen",
    germany: "Deutschland",
    austria: "Österreich",
    serbia: "Serbien",
    quantity: "Menge",
    create: "Beste Angebote finden",
    creating: "Suche wird gestartet...",
    createFailed: "Die Suche wurde nicht erstellt. Bitte versuchen Sie es erneut.",
    quotaUsage: (plan, used, limit) => `${plan} · ${used}/${limit} Live-Suchen in diesem Monat verwendet`,
    quotaExhausted: "Das monatliche Limit ist erreicht. Gespeicherte Suchen bleiben verfügbar.",
    managePlan: "Tarif und Abrechnung",
    voiceStart: "Spracheingabe",
    voiceStop: "Stoppen",
    voiceListening: "Ich höre zu...",
    voiceUnavailable: "Spracheingabe wird in diesem Browser nicht unterstützt.",
    voiceError: "Die Sprache konnte nicht erkannt werden. Bitte versuchen Sie es erneut.",
  },
  en: {
    productLabel: "Product",
    productPlaceholder: "e.g. USB-C 100W cable",
    destination: "Destination",
    destinationPrompt: "Select a country",
    germany: "Germany",
    austria: "Austria",
    serbia: "Serbia",
    quantity: "Quantity",
    create: "Find best offers",
    creating: "Starting search...",
    createFailed: "The search was not created. Please try again.",
    quotaUsage: (plan, used, limit) => `${plan} · ${used}/${limit} live searches used this month`,
    quotaExhausted: "The monthly limit is reached. Saved searches remain available.",
    managePlan: "Plan and billing",
    voiceStart: "Voice input",
    voiceStop: "Stop",
    voiceListening: "Listening...",
    voiceUnavailable: "Voice input is not supported in this browser.",
    voiceError: "Speech could not be recognized. Please try again.",
  },
};

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript?: string };
};

type BrowserSpeechRecognitionEvent = Event & {
  readonly results: {
    readonly length: number;
    readonly [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  readonly error?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const browserWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function speechLocale(locale: Locale) {
  if (locale === "sr") return "sr-RS";
  if (locale === "de") return "de-DE";
  return "en-US";
}

type SearchQuotaView = {
  plan: "FREE" | "PLUS" | "PRO";
  used: number;
  limit: number;
  remaining: number;
};

export function DashboardPrimaryActions({
  quota,
}: {
  quota?: SearchQuotaView | null;
} = {}) {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const productInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceBaseValueRef = useRef("");

  useEffect(() => {
    setVoiceSupported(Boolean(speechRecognitionConstructor()));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);


  function stopVoiceInput() {
    recognitionRef.current?.stop();
  }

  function startVoiceInput() {
    setVoiceError("");
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceError(text.voiceUnavailable);
      return;
    }

    const field = productInputRef.current;
    if (!field) return;

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = speechLocale(locale);
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voiceBaseValueRef.current = field.value.trim();

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const spoken = transcript.trim();
      const base = voiceBaseValueRef.current;
      field.value = [base, spoken].filter(Boolean).join(base && spoken ? " " : "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };

    recognition.onerror = () => {
      setVoiceError(text.voiceError);
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
      field.focus();
    };

    recognitionRef.current = recognition;
    setVoiceListening(true);
    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
      recognitionRef.current = null;
      setVoiceError(text.voiceError);
    }
  }

  async function createSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          targetCountry: form.get("targetCountry"),
          quantity: form.get("quantity"),
        }),
      });
      const project = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;

      if (!response.ok || !project?.id) {
        throw new Error(project?.error ?? text.createFailed);
      }

      router.push(getProjectCreationDestination(project.id, "search"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.createFailed);
      setPending(false);
    }
  }

  return (
    <form className={styles.card} aria-busy={pending} onSubmit={createSearch}>
      <div className={styles.mainField}>
        <div className={styles.mainFieldHeader}>
          <label className={styles.mainLabel} htmlFor="jakov360-product-search">
            {text.productLabel}
          </label>
          {voiceSupported && (
            <button
              aria-label={voiceListening ? text.voiceStop : text.voiceStart}
              aria-pressed={voiceListening}
              className={styles.voiceButton}
              disabled={pending}
              onClick={voiceListening ? stopVoiceInput : startVoiceInput}
              type="button"
            >
              <span aria-hidden="true">{voiceListening ? "■" : "🎙"}</span>
              {voiceListening ? text.voiceListening : text.voiceStart}
            </button>
          )}
        </div>
        <textarea
          className={styles.description}
          id="jakov360-product-search"
          maxLength={160}
          minLength={2}
          name="name"
          placeholder={text.productPlaceholder}
          ref={productInputRef}
          required
        />
        {voiceError && <p className={styles.voiceError} role="alert">{voiceError}</p>}
      </div>

      <div className={styles.businessGrid}>
        <label className={styles.fieldLabel}>
          {text.quantity}
          <input min="1" name="quantity" placeholder="100" required step="1" type="number" />
        </label>
        <label className={styles.fieldLabel}>
          {text.destination}
          <select defaultValue="" name="targetCountry" required>
            <option disabled value="">{text.destinationPrompt}</option>
            <option value="AT">{text.austria}</option>
            <option value="DE">{text.germany}</option>
            <option value="RS">{text.serbia}</option>
          </select>
        </label>
      </div>

      {quota && (
        <div className={styles.quotaStatus}>
          <strong>{text.quotaUsage(quota.plan, quota.used, quota.limit)}</strong>
          {quota.remaining <= 0 && <span>{text.quotaExhausted}</span>}
          <a href="/billing">{text.managePlan}</a>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.footerActions}>
        <span />
        <button
          className={styles.primaryAction}
          disabled={pending}
          type="submit"
        >
          {pending ? text.creating : text.create}
        </button>
      </div>
    </form>
  );
}
