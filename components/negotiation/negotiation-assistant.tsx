"use client";

import type { NegotiationMessage } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";

type MessageWithOffer = NegotiationMessage & { offer: { supplierName: string } };

export function NegotiationAssistant({
  projectId,
  canGenerate,
  messages,
}: {
  projectId: string;
  canGenerate: boolean;
  messages: MessageWithOffer[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [tone, setTone] = useState("FORMAL");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const sectionRef = useRef<HTMLElement>(null);
  const toneRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!canGenerate || sessionStorage.getItem("focus-negotiation-assistant") !== "true") return;
    sessionStorage.removeItem("focus-negotiation-assistant");
    const section = sectionRef.current;
    if (!section) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = window.scrollY;
    const target = section.getBoundingClientRect().top + start - 16;
    const duration = reduceMotion ? 0 : 250;
    const startedAt = performance.now();

    function scroll(now: number) {
      const progress = duration === 0 ? 1 : Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(scroll);
      else toneRef.current?.focus({ preventScroll: true });
    }

    requestAnimationFrame(scroll);
  }, [canGenerate]);

  async function generate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/negotiation-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? "Poruka nije generisana. Pokušajte ponovo.");
      else router.refresh();
    } catch {
      setError("Veza sa serverom nije dostupna. Pokušajte ponovo.");
    } finally {
      setPending(false);
    }
  }

  async function markSent(messageId: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/negotiation-messages/${messageId}/sent`, {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? "Status poruke nije promenjen.");
      else router.refresh();
    } catch {
      setError("Veza sa serverom nije dostupna. Pokušajte ponovo.");
    } finally {
      setPending(false);
    }
  }

  async function copyMessage(message: MessageWithOffer) {
    try {
      await navigator.clipboard.writeText(drafts[message.id] ?? message.body);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(""), 1800);
    } catch {
      setError(t("Poruka nije kopirana. Pokušajte ponovo."));
    }
  }

  return (
    <section className="dashboard-card negotiation-panel" ref={sectionRef}>
      <header className="section-header">
        <div>
          <p className="eyebrow">{t("Sledeći korak")}</p>
          <h2>{t("Asistent za pregovore")}</h2>
          <p>{t("Izaberite stil komunikacije sa dobavljačem.")}</p>
        </div>
        <div className="actions">
          <label className="negotiation-tone">{t("Stil pregovora")}
            <select onChange={(event) => setTone(event.target.value)} ref={toneRef} value={tone}>
              <option value="FORMAL">Formalno</option>
              <option value="DIRECT">Direktno</option>
              <option value="FRIENDLY">Prijateljski</option>
            </select>
          </label>
          {canGenerate && (
            <button disabled={pending} onClick={generate} type="button">
              {pending ? "Generisanje..." : t("Predloži poruku")}
            </button>
          )}
        </div>
      </header>
      <div className="tone-explanations">
        <span><strong>{t("Formalno")}</strong> — {t("profesionalan i neutralan pristup")}</span>
        <span><strong>{t("Direktno")}</strong> — {t("fokus na cenu i uslove")}</span>
        <span><strong>{t("Prijateljski")}</strong> — {t("fokus na dugoročnu saradnju")}</span>
      </div>
      <p>{t("Poruka koristi podatke iz analize ponude i ne menja cenu, rizik niti preporuku.")}</p>
      {!canGenerate && <p className="form-error">⚠ {t("Prvo izaberite opciju „Pregovaraj“ da biste dobili predlog poruke.")}</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="message-history">
        {messages.map((message) => (
          <article className="message-card" key={message.id}>
            <header className="section-header">
              <div><strong>{message.subject}</strong><p>{message.offer.supplierName} · {getStatusLabel(message.tone, locale)} · {getStatusLabel(message.status, locale)}</p></div>
              {message.status === "PROPOSED" && <button className="secondary-button" onClick={() => markSent(message.id)} type="button">Označi kao poslato</button>}
            </header>
            {editingId === message.id ? (
              <textarea
                className="message-editor"
                onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                value={drafts[message.id] ?? message.body}
              />
            ) : <pre>{drafts[message.id] ?? message.body}</pre>}
            <div className="message-actions">
              <button className="secondary-button" onClick={() => copyMessage(message)} type="button">
                {copiedId === message.id ? t("Poruka je kopirana") : t("Kopiraj poruku")}
              </button>
              <button className="secondary-button" onClick={() => setEditingId(editingId === message.id ? "" : message.id)} type="button">
                {editingId === message.id ? t("Završi izmenu") : t("Izmeni poruku")}
              </button>
              <button disabled title={t("Slanje e-maila biće dostupno kasnije.")} type="button">
                {t("Pošalji e-mail")} · {t("Uskoro")}
              </button>
            </div>
            <details>
              <summary>Zaključani zahtevi i činjenice</summary>
              <p>Zahtevi: {message.requestTypes.join(", ")}</p>
              <pre>{JSON.stringify(message.lockedFacts, null, 2)}</pre>
            </details>
          </article>
        ))}
        {messages.length === 0 && canGenerate && (
          <div className="negotiation-ready">
            <strong>Predložena poruka spremna</strong>
            <p>Izaberite ton i generišite poruku zasnovanu na preporuci projekta.</p>
          </div>
        )}
        {messages.length === 0 && !canGenerate && <p>{t("Prvo izaberite ponudu i potvrdite odluku (KUPI / PREGOVARAJ / PRESKOČI).")}</p>}
      </div>
    </section>
  );
}
