"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";
import { parseVoiceSearchIntake } from "@/modules/product-search/domain/voice-search-intake";

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
  voiceHeard: string;
  voiceWaiting: string;
  voiceUnavailable: string;
  voiceError: string;
  voiceNoSpeech: string;
  voiceReview: string;
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
    voiceStop: "Zaustavi i popuni",
    voiceListening: "Slušam...",
    voiceHeard: "Čujem",
    voiceWaiting: "Počnite da govorite. Tekst će se pojaviti ovde.",
    voiceUnavailable: "Govorni unos nije podržan u ovom pregledaču.",
    voiceError: "Govor nije mogao da se prepozna. Proverite dozvolu za mikrofon i pokušajte ponovo.",
    voiceNoSpeech: "Nisam dobio prepoznat govor. Pokušajte ponovo i govorite dok je prikazano „Slušam...“.",
    voiceReview: "JAKOV360 je popunio ono što je razumeo. Proverite proizvod, količinu i destinaciju pre pretrage.",
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
    voiceStop: "Stoppen und übernehmen",
    voiceListening: "Ich höre zu...",
    voiceHeard: "Erkannt",
    voiceWaiting: "Sprechen Sie jetzt. Der erkannte Text erscheint hier.",
    voiceUnavailable: "Spracheingabe wird in diesem Browser nicht unterstützt.",
    voiceError: "Die Sprache konnte nicht erkannt werden. Prüfen Sie die Mikrofonberechtigung und versuchen Sie es erneut.",
    voiceNoSpeech: "Es wurde keine Sprache erkannt. Versuchen Sie es erneut und sprechen Sie, solange „Ich höre zu...“ angezeigt wird.",
    voiceReview: "JAKOV360 hat die erkannten Angaben eingetragen. Prüfen Sie Produkt, Menge und Zielland vor der Suche.",
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
    voiceStop: "Stop and fill",
    voiceListening: "Listening...",
    voiceHeard: "Hearing",
    voiceWaiting: "Start speaking. Recognized text will appear here.",
    voiceUnavailable: "Voice input is not supported in this browser.",
    voiceError: "Speech could not be recognized. Check microphone permission and try again.",
    voiceNoSpeech: "No speech was recognized. Try again and speak while “Listening...” is shown.",
    voiceReview: "JAKOV360 filled the details it understood. Review the product, quantity, and destination before searching.",
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
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceReviewVisible, setVoiceReviewVisible] = useState(false);
  const productInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const countryInputRef = useRef<HTMLSelectElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceShouldListenRef = useRef(false);
  const voiceCommittedTranscriptRef = useRef("");
  const voiceSessionTranscriptRef = useRef("");
  const voiceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      voiceShouldListenRef.current = false;
      if (voiceRestartTimerRef.current) clearTimeout(voiceRestartTimerRef.current);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);


  function normalizedTranscript(...parts: string[]) {
    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function applyVoiceTranscript(transcript: string) {
    const spoken = transcript.trim();
    if (!spoken) {
      setVoiceError(text.voiceNoSpeech);
      setVoiceReviewVisible(false);
      return;
    }

    const parsed = parseVoiceSearchIntake(spoken, locale);
    let understood = false;

    if (parsed.product && productInputRef.current) {
      productInputRef.current.value = parsed.product;
      productInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      understood = true;
    }
    if (parsed.quantity && quantityInputRef.current) {
      quantityInputRef.current.value = String(parsed.quantity);
      quantityInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      understood = true;
    }
    if (parsed.targetCountry && countryInputRef.current) {
      countryInputRef.current.value = parsed.targetCountry;
      countryInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      understood = true;
    }

    setVoiceReviewVisible(understood);
    if (!understood) setVoiceError(text.voiceError);
    productInputRef.current?.focus();
  }

  function currentVoiceTranscript() {
    return normalizedTranscript(
      voiceCommittedTranscriptRef.current,
      voiceSessionTranscriptRef.current,
    );
  }

  function finishVoiceInput() {
    const transcript = currentVoiceTranscript();
    setVoiceListening(false);
    setVoiceTranscript(transcript);
    recognitionRef.current = null;
    applyVoiceTranscript(transcript);
  }

  function beginVoiceRecognitionSession(Recognition: BrowserSpeechRecognitionConstructor) {
    if (!voiceShouldListenRef.current) return;

    const recognition = new Recognition();
    recognition.lang = speechLocale(locale);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voiceSessionTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let sessionTranscript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        sessionTranscript += `${event.results[index]?.[0]?.transcript ?? ""} `;
      }
      voiceSessionTranscriptRef.current = sessionTranscript.trim();
      setVoiceTranscript(currentVoiceTranscript());
    };

    recognition.onerror = (event) => {
      const recoverable = event.error === "no-speech" || event.error === "aborted";
      if (recoverable && voiceShouldListenRef.current) return;

      voiceShouldListenRef.current = false;
      setVoiceListening(false);
      recognitionRef.current = null;
      if (event.error !== "aborted") setVoiceError(text.voiceError);
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (!voiceShouldListenRef.current) {
        finishVoiceInput();
        return;
      }

      voiceCommittedTranscriptRef.current = currentVoiceTranscript();
      voiceSessionTranscriptRef.current = "";
      setVoiceTranscript(voiceCommittedTranscriptRef.current);

      voiceRestartTimerRef.current = setTimeout(() => {
        voiceRestartTimerRef.current = null;
        beginVoiceRecognitionSession(Recognition);
      }, 150);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      voiceShouldListenRef.current = false;
      setVoiceListening(false);
      recognitionRef.current = null;
      setVoiceError(text.voiceError);
    }
  }

  function stopVoiceInput() {
    if (!voiceListening) return;
    voiceShouldListenRef.current = false;
    if (voiceRestartTimerRef.current) {
      clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }

    const recognition = recognitionRef.current;
    if (!recognition) {
      finishVoiceInput();
      return;
    }

    try {
      recognition.stop();
    } catch {
      finishVoiceInput();
    }
  }

  function startVoiceInput() {
    setVoiceError("");
    setVoiceReviewVisible(false);
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceError(text.voiceUnavailable);
      return;
    }

    recognitionRef.current?.abort();
    if (voiceRestartTimerRef.current) clearTimeout(voiceRestartTimerRef.current);
    voiceCommittedTranscriptRef.current = "";
    voiceSessionTranscriptRef.current = "";
    setVoiceTranscript("");
    voiceShouldListenRef.current = true;
    setVoiceListening(true);
    beginVoiceRecognitionSession(Recognition);
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
        </div>
        {voiceListening && (
          <div className={styles.voiceLive} role="status" aria-live="polite">
            <div className={styles.voiceLiveHeader}>
              <span className={styles.voicePulse} aria-hidden="true">
                <i /><i /><i />
              </span>
              <strong>{text.voiceListening}</strong>
            </div>
            <p>
              <span>{text.voiceHeard}: </span>
              {voiceTranscript || text.voiceWaiting}
            </p>
          </div>
        )}
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
        {voiceTranscript && !voiceListening && (
          <p className={styles.voiceTranscriptFinal}>
            <strong>{text.voiceHeard}:</strong> {voiceTranscript}
          </p>
        )}
        {voiceReviewVisible && !voiceListening && (
          <p className={styles.voiceReview} role="status">{text.voiceReview}</p>
        )}
      </div>

      <div className={styles.businessGrid}>
        <label className={styles.fieldLabel}>
          {text.quantity}
          <input
            min="1"
            name="quantity"
            placeholder="100"
            ref={quantityInputRef}
            required
            step="1"
            type="number"
          />
        </label>
        <label className={styles.fieldLabel}>
          {text.destination}
          <select defaultValue="" name="targetCountry" ref={countryInputRef} required>
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
