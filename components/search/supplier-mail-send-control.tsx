"use client";

import { useEffect, useId, useState } from "react";

type Mailbox = { id: string; emailAddress: string };
type Preview = {
  from: string;
  to: string;
  subject: string;
  body: string;
  contentHash: string;
  approvalToken: string;
};

export function SupplierMailSendControl({
  projectId,
  productUrl,
  draftCurrent,
  onSent,
}: {
  projectId: string;
  productUrl: string;
  draftCurrent: boolean;
  onSent: () => Promise<void>;
}) {
  const id = useId();
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approved, setApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/mail/gmail/connections", {
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) return null;
      return await response.json() as {
        enabled?: boolean;
        connections?: Mailbox[];
      };
    }).then((result) => {
      if (controller.signal.aborted || !result) return;
      setFeatureEnabled(result.enabled === true);
      const list = result.connections ?? [];
      setMailboxes(list);
      setMailboxId((current) => current || list[0]?.id || "");
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  function invalidate() {
    setPreview(null);
    setApproved(false);
    setError("");
    setSuccess("");
  }

  async function requestPreview() {
    if (!draftCurrent || !mailboxId || !recipient.trim()) return;
    setSending(true);
    invalidate();
    try {
      const response = await fetch("/api/mail/supplier/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          productUrl,
          connectionId: mailboxId,
          recipient: recipient.trim(),
        }),
      });
      const result = await response.json().catch(() => null) as Preview & {
        error?: string;
      } | null;
      if (!response.ok || !result?.approvalToken) {
        throw new Error(result?.error ?? "Provera poruke nije uspela.");
      }
      setPreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Provera poruke nije uspela.");
    } finally {
      setSending(false);
    }
  }

  async function sendApproved() {
    if (!preview || !approved || sending || !draftCurrent) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/mail/supplier/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          productUrl,
          approvalToken: preview.approvalToken,
        }),
      });
      const result = await response.json().catch(() => null) as {
        status?: string;
        error?: string;
      } | null;
      if (!response.ok || result?.status !== "SENT") {
        throw new Error(result?.error ?? "Nije potvrđeno da je Gmail poslao poruku.");
      }
      setSuccess("Gmail je potvrdio slanje poruke. Identifikatori su sačuvani.");
      setPreview(null);
      setApproved(false);
      await onSent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nije potvrđeno slanje.");
      // Do not retry automatically; the provider may already have sent it.
      setPreview(null);
      setApproved(false);
    } finally {
      setSending(false);
    }
  }

  if (!featureEnabled) return null;

  return (
    <section className="supplier-mail-send-control">
      <h4>Pošalji direktno iz JAKOV360 — Gmail TEST</h4>
      <p>Slanje je dozvoljeno samo testnoj adresi i nakon pregleda. Automatskog slanja nema.</p>
      {mailboxes.length === 0 ? (
        <p><a href="/account">Najpre povežite Gmail u delu Nalog.</a></p>
      ) : (
        <>
          <label htmlFor={`${id}-mailbox`}>Šalje sa Gmail naloga</label>
          <select
            id={`${id}-mailbox`}
            value={mailboxId}
            disabled={sending}
            onChange={(event) => { setMailboxId(event.target.value); invalidate(); }}
          >
            {mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>{mailbox.emailAddress}</option>
            ))}
          </select>
          <label htmlFor={`${id}-recipient`}>Testni primalac</label>
          <input
            id={`${id}-recipient`}
            type="email"
            value={recipient}
            disabled={sending}
            autoComplete="off"
            placeholder="Druga testna email adresa"
            onChange={(event) => { setRecipient(event.target.value); invalidate(); }}
          />
          <button
            className="secondary-button"
            disabled={sending || !mailboxId || !recipient.trim() || !draftCurrent}
            onClick={() => void requestPreview()}
            type="button"
          >
            Pregledaj tačnu poruku pre slanja
          </button>
          {!draftCurrent && <p>Najpre sačuvajte i proverite aktuelni prevod poruke.</p>}
          {preview && (
            <div className="supplier-mail-preview">
              <p><strong>Od:</strong> {preview.from}</p>
              <p><strong>Za:</strong> {preview.to}</p>
              <p><strong>Naslov:</strong> {preview.subject}</p>
              <textarea readOnly rows={10} value={preview.body} aria-label="Pregled Gmail poruke" />
              <label>
                <input
                  checked={approved}
                  type="checkbox"
                  disabled={sending}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                Proverio/la sam primaoca, naslov i ceo tekst. Izričito odobravam ovo jedno slanje.
              </label>
              <button
                className="primary-button"
                disabled={!approved || sending || !draftCurrent}
                onClick={() => void sendApproved()}
                type="button"
              >
                {sending ? "Slanje..." : "Potvrdi i pošalji Gmail poruku"}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="supplier-terms-warning" role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </section>
  );
}
