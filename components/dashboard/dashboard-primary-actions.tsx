"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";

import styles from "./dashboard-primary-actions.module.css";

const MAX_VOICE_SECONDS = 30;

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
  voiceRecording: string;
  voiceReceiving: string;
  voiceProcessing: string;
  voiceUnavailable: string;
  voicePermission: string;
  voiceError: string;
  voiceReview: string;
  voiceHeard: string;
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
    voiceStop: "ZAUSTAVI",
    voiceRecording: "Snimam...",
    voiceReceiving: "Mikrofon prima vaš glas",
    voiceProcessing: "JAKOV360 razume govor...",
    voiceUnavailable: "Snimanje glasa nije podržano u ovom pregledaču.",
    voicePermission: "Mikrofon nije dostupan. Dozvolite pristup mikrofonu i pokušajte ponovo.",
    voiceError: "Govor nije mogao da se obradi. Pokušajte ponovo.",
    voiceReview: "JAKOV360 je popunio ono što je razumeo. Proverite proizvod, količinu i destinaciju pre pretrage.",
    voiceHeard: "Čuo sam",
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
    voiceStop: "STOPP",
    voiceRecording: "Aufnahme läuft...",
    voiceReceiving: "Das Mikrofon empfängt Ihre Stimme",
    voiceProcessing: "JAKOV360 versteht die Sprache...",
    voiceUnavailable: "Sprachaufnahme wird in diesem Browser nicht unterstützt.",
    voicePermission: "Mikrofon nicht verfügbar. Erlauben Sie den Mikrofonzugriff und versuchen Sie es erneut.",
    voiceError: "Die Sprache konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
    voiceReview: "JAKOV360 hat die erkannten Angaben eingetragen. Prüfen Sie Produkt, Menge und Zielland vor der Suche.",
    voiceHeard: "Erkannt",
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
    voiceStop: "STOP",
    voiceRecording: "Recording...",
    voiceReceiving: "The microphone is receiving your voice",
    voiceProcessing: "JAKOV360 is understanding your speech...",
    voiceUnavailable: "Voice recording is not supported in this browser.",
    voicePermission: "Microphone unavailable. Allow microphone access and try again.",
    voiceError: "Speech could not be processed. Please try again.",
    voiceReview: "JAKOV360 filled the details it understood. Review the product, quantity, and destination before searching.",
    voiceHeard: "I heard",
  },
};

type SearchQuotaView = {
  plan: "FREE" | "PLUS" | "PRO";
  used: number;
  limit: number;
  remaining: number;
};

type VoiceIntakeResponse = {
  transcript?: string;
  product?: string | null;
  quantity?: number | null;
  targetCountry?: "AT" | "DE" | "RS" | null;
  error?: string;
};

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function voiceFilename(mimeType: string) {
  if (mimeType.includes("mp4")) return "jakov360-voice.m4a";
  if (mimeType.includes("ogg")) return "jakov360-voice.ogg";
  return "jakov360-voice.webm";
}

function voiceTime(seconds: number) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

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
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceReviewVisible, setVoiceReviewVisible] = useState(false);

  const productInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const countryInputRef = useRef<HTMLSelectElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const voiceMeterRef = useRef<HTMLDivElement | null>(null);

  function stopMediaTracks() {
    for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop();
    mediaStreamRef.current = null;
  }

  function stopVoiceMeter() {
    if (analyserFrameRef.current !== null) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
    voiceMeterRef.current?.style.setProperty("--voice-level", "0.04");
  }

  function clearVoiceTimer() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function cleanupVoiceResources() {
    clearVoiceTimer();
    stopVoiceMeter();
    stopMediaTracks();
    mediaRecorderRef.current = null;
  }

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }
      cleanupVoiceResources();
    };
  }, []);

  function startVoiceMeter(stream: MediaStream) {
    if (typeof AudioContext === "undefined") return;

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    audioContextRef.current = context;

    const draw = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      const rms = Math.sqrt(energy / samples.length);
      const level = Math.max(0.04, Math.min(1, rms * 7));
      voiceMeterRef.current?.style.setProperty("--voice-level", level.toFixed(3));
      analyserFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  function applyVoiceResult(payload: VoiceIntakeResponse) {
    let understood = false;

    if (payload.product && productInputRef.current) {
      productInputRef.current.value = payload.product;
      productInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      understood = true;
    }
    if (payload.quantity && quantityInputRef.current) {
      quantityInputRef.current.value = String(payload.quantity);
      quantityInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      understood = true;
    }
    if (payload.targetCountry && countryInputRef.current) {
      countryInputRef.current.value = payload.targetCountry;
      countryInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      understood = true;
    }

    setVoiceReviewVisible(understood);
    productInputRef.current?.focus();
  }

  async function submitVoiceRecording(blob: Blob) {
    setVoiceProcessing(true);
    setVoiceError("");

    const formData = new FormData();
    formData.set("audio", blob, voiceFilename(blob.type));
    formData.set("locale", locale);

    try {
      const response = await fetch("/api/voice-intake", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as VoiceIntakeResponse | null;

      if (!response.ok || !payload?.transcript) {
        throw new Error(payload?.error ?? text.voiceError);
      }

      setVoiceTranscript(payload.transcript);
      applyVoiceResult(payload);
    } catch (caught) {
      setVoiceError(caught instanceof Error && caught.message ? caught.message : text.voiceError);
      setVoiceReviewVisible(false);
    } finally {
      setVoiceProcessing(false);
    }
  }

  function stopVoiceInput() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  }

  async function startVoiceInput() {
    setVoiceError("");
    setVoiceTranscript("");
    setVoiceReviewVisible(false);

    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceError(text.voiceUnavailable);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recordingSecondsRef.current = 0;
      setVoiceSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setVoiceRecording(false);
        setVoiceError(text.voiceError);
        cleanupVoiceResources();
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        audioChunksRef.current = [];
        setVoiceRecording(false);
        cleanupVoiceResources();

        if (blob.size < 200) {
          setVoiceError(text.voiceError);
          return;
        }
        void submitVoiceRecording(blob);
      };

      recorder.start(250);
      setVoiceRecording(true);
      startVoiceMeter(stream);

      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        const seconds = recordingSecondsRef.current;
        setVoiceSeconds(seconds);
        if (seconds >= MAX_VOICE_SECONDS && recorder.state === "recording") {
          recorder.stop();
        }
      }, 1_000);
    } catch {
      cleanupVoiceResources();
      setVoiceRecording(false);
      setVoiceError(text.voicePermission);
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
    <form className={styles.card} aria-busy={pending || voiceProcessing} onSubmit={createSearch}>
      <div className={styles.mainField}>
        <div className={styles.mainFieldHeader}>
          <label className={styles.mainLabel} htmlFor="jakov360-product-search">
            {text.productLabel}
          </label>

          {!voiceRecording && (
            <button
              className={styles.voiceButton}
              disabled={pending || voiceProcessing}
              onClick={() => void startVoiceInput()}
              type="button"
            >
              <span aria-hidden="true">🎙</span>
              {voiceProcessing ? text.voiceProcessing : text.voiceStart}
            </button>
          )}
        </div>

        {voiceRecording && (
          <div className={styles.voiceRecorder} role="status">
            <div className={styles.voiceRecorderTop}>
              <div>
                <strong>{text.voiceRecording}</strong>
                <span>{voiceTime(voiceSeconds)} / 0:{MAX_VOICE_SECONDS}</span>
              </div>
              <button
                className={styles.voiceStopButton}
                onClick={stopVoiceInput}
                type="button"
              >
                <span aria-hidden="true">■</span> {text.voiceStop}
              </button>
            </div>
            <div className={styles.voiceMeter} ref={voiceMeterRef} aria-hidden="true">
              <span />
            </div>
            <p>{text.voiceReceiving}</p>
          </div>
        )}

        {voiceProcessing && (
          <div className={styles.voiceProcessing} role="status" aria-live="polite">
            <span className={styles.voicePulse} aria-hidden="true"><i /><i /><i /></span>
            <strong>{text.voiceProcessing}</strong>
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
        {voiceTranscript && !voiceProcessing && (
          <p className={styles.voiceTranscriptFinal}>
            <strong>{text.voiceHeard}:</strong> {voiceTranscript}
          </p>
        )}
        {voiceReviewVisible && !voiceProcessing && (
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
          disabled={pending || voiceRecording || voiceProcessing}
          type="submit"
        >
          {pending ? text.creating : text.create}
        </button>
      </div>
    </form>
  );
}
