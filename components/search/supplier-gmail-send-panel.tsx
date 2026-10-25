"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/modules/i18n/translations";

type Mailbox = {
  id: string;
  mailboxEmail: string;
};

type MailPreview = {
  status: "READY" | "PENDING" | "SENT" | "UNCERTAIN";
  from: string;
  to: string;
  subject: string;
  body: string | null;
  approvalHash: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
};

const wording = {
  sr: {
    title: "Pošalji preko povezanog Gmail-a",
    from: "Povezani Gmail nalog",
    recipient: "Test adresa primaoca",
    inspect: "Prikaži poruku za odobrenje",
    approve: "Pregledao/la sam primaoca, naslov i celu poruku i odobravam slanje.",
    submit: "Pošalji preko Gmail-a",
    working: "Proveravam slanje...",
    connect: "Prvo povežite Gmail u nalogu.",
    notice: "Stvarno slanje je dozvoljeno samo test adresama. Gmail trenutno ne preuzima odgovore automatski.",
    error: "Gmail slanje nije uspelo. Nemojte ponovo slati bez provere.",
    ready: "Proverite poruku pre slanja.",
    sent: "Gmail je potvrdio slanje. Sačuvani su identifikatori poruke i prepiske.",
    pending: "Slanje je pokrenuto. Ishod se još proverava; ponovno slanje je blokirano.",
    uncertain: "Ishod je nepoznat. Ne šaljite ponovo dok se Gmail status ne razjasni.",
    notReady: "Sačuvajte aktuelni prevod pre slanja iz aplikacije.",
    choose: "Izaberite Gmail nalog",
  },
  de: {
    title: "Über verbundenes Gmail senden",
    from: "Verbundenes Gmail-Konto",
    recipient: "Test-Empfängeradresse",
    inspect: "Nachricht zur Freigabe prüfen",
    approve: "Ich habe Empfänger, Betreff und gesamten Text geprüft und stimme dem Versand zu.",
    submit: "Über Gmail senden",
    working: "Versand wird geprüft...",
    connect: "Verbinden Sie zuerst Gmail in Ihrem Konto.",
    notice: "Echter Versand ist nur an Testadressen erlaubt. Antworten werden noch nicht automatisch abgeholt.",
    error: "Gmail-Versand fehlgeschlagen. Ohne Prüfung nicht erneut senden.",
    ready: "Bitte prüfen Sie die Nachricht vor dem Versand.",
    sent: "Gmail hat die Sendung bestätigt; Nachrichten- und Thread-ID wurden gespeichert.",
    pending: "Versand läuft; wiederholtes Senden ist gesperrt.",
    uncertain: "Versandstatus unklar. Bitte nicht erneut senden.",
    notReady: "Speichern Sie zuerst die aktuelle Übersetzung.",
    choose: "Gmail-Konto wählen",
  },
  en: {
    title: "Send using connected Gmail",
    from: "Connected Gmail account",
    recipient: "Test recipient email",
    inspect: "Review exact message",
    approve: "I reviewed the recipient, subject and full text, and I approve sending it.",
    submit: "Send using Gmail",
    working: "Checking delivery...",
    connect: "Connect Gmail in Account first.",
    notice: "Real sending is limited to test recipients. Reply retrieval is not yet automated.",
    error: "Gmail delivery failed. Do not resend without verifying the outcome.",
    ready: "Review the full message before sending.",
    sent: "Gmail confirmed delivery and provider message/thread IDs were saved.",
    pending: "Send attempt is pending; another send is blocked.",
    uncertain: "Outcome unknown. Do not send again until reconciled.",
    notReady: "Save the current translation before sending through the app.",
    choose: "Choose Gmail account",
  },
} as const;

export function SupplierGmailSendPanel({
  projectId,
  productUrl,
  locale,
  readyToSend,
  draftRevision,
  onSent,
}: {
  projectId: string;
  productUrl: string;
  locale: Locale;
  readyToSend: boolean;
  draftRevision: string;
  onSent: () => void;
}) {
  const labels = wording[locale];
  const [enabled, setEnabled] = useState(false);
  const [connections, setConnections] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [preview, setPreview] = useState<MailPreview | null>(null);
  const [reviewKey, setReviewKey] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const currentReviewKey = JSON.stringify([projectId, productUrl, mailboxId, recipient.trim().toLowerCase(), draftRevision, readyToSend]);
  const visiblePreview = readyToSend && reviewKey === currentReviewKey ? preview : null;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/mail/google/connections", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { connections?: Mailbox[] };
      if (cancelled) return;
      const mailboxes = body.connections ?? [];
      setEnabled(true);
      setConnections(mailboxes);
      setMailboxId(mailboxes[0]?.id ?? "");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function review() {
    if (!mailboxId || !readyToSend) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setApproved(false);
    try {
      const params = new URLSearchParams({
        productUrl,
        mailboxConnectionId: mailboxId,
        recipient: recipient.trim(),
      });
      const res = await fetch(
        `/api/projects/${projectId}/supplier-confirmations/mail?${params}`,
        { cache: "no-store" },
      );
      const payload = await res.json() as MailPreview & { error?: string };
      if (!res.ok) throw new Error(payload.error || labels.error);
      setReviewKey(currentReviewKey);
      setPreview(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (
      !visiblePreview ||
      visiblePreview.status !== "READY" ||
      !visiblePreview.approvalHash ||
      !approved ||
      !readyToSend
    ) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/supplier-confirmations/mail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productUrl,
          mailboxConnectionId: mailboxId,
          recipient: recipient.trim(),
          approvedHash: visiblePreview.approvalHash,
          explicitApproval: true,
        }),
      });
      const payload = await res.json() as {
        status?: string;
        error?: string;
        providerMessageId?: string;
        providerThreadId?: string;
      };
      if (!res.ok || payload.status !== "SENT") {
        setPreview(null);
        setApproved(false);
        setError(payload.error || labels.error);
        return;
      }
      setSent(true);
      setApproved(false);
      setPreview({
        ...visiblePreview,
        status: "SENT",
        body: null,
        approvalHash: null,
        providerMessageId: payload.providerMessageId ?? null,
        providerThreadId: payload.providerThreadId ?? null,
      });
      onSent();
    } catch {
      setPreview(null);
      setApproved(false);
      setError(labels.uncertain);
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="supplier-connected-mail">
      <h4>{labels.title}</h4>
      <p className="muted-text">{labels.notice}</p>
      {connections.length === 0 ? (
        <p><a href="/account">{labels.connect}</a></p>
      ) : (
        <>
          <label>
            {labels.from}
            <select value={mailboxId} disabled={busy || sent} onChange={(event) => setMailboxId(event.target.value)}>
              <option value="">{labels.choose}</option>
              {connections.map((mailbox) =>
                <option key={mailbox.id} value={mailbox.id}>{mailbox.mailboxEmail}</option>
              )}
            </select>
          </label>
          <label>
            {labels.recipient}
            <input
              type="email"
              autoComplete="off"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              disabled={busy || sent}
              placeholder="test@example.com"
              maxLength={320}
            />
          </label>
          {!readyToSend && !sent && <p className="supplier-terms-warning">{labels.notReady}</p>}
          {!sent && (
            <button
              className="secondary-button"
              disabled={busy || !readyToSend || !mailboxId || !recipient.trim()}
              type="button"
              onClick={() => void review()}
            >
              {labels.inspect}
            </button>
          )}
          {visiblePreview?.status === "READY" && visiblePreview.body !== null && (
            <div className="supplier-mail-review">
              <p><strong>{labels.from}:</strong> {visiblePreview.from}</p>
              <p><strong>{labels.recipient}:</strong> {visiblePreview.to}</p>
              <p><strong>Subject:</strong> {visiblePreview.subject}</p>
              <textarea readOnly rows={9} value={visiblePreview.body} />
              <label className="supplier-mail-approval">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                  disabled={busy || !readyToSend}
                />
                {labels.approve}
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void send()}
                disabled={!approved || busy || !readyToSend}
              >
                {busy ? labels.working : labels.submit}
              </button>
            </div>
          )}
          {(visiblePreview?.status === "PENDING" || visiblePreview?.status === "UNCERTAIN") && (
            <p className="supplier-terms-warning">
              {visiblePreview.status === "PENDING" ? labels.pending : labels.uncertain}
            </p>
          )}
          {(sent || visiblePreview?.status === "SENT") && (
            <p role="status">
              {labels.sent}
              {visiblePreview?.providerMessageId && <code>{visiblePreview.providerMessageId}</code>}
            </p>
          )}
          {error && <p className="supplier-terms-warning" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
