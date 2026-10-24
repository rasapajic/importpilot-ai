"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Connection = { id: string; emailAddress: string; connectedAt: string | Date };

export function GmailMailboxManager({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function disconnect(connectionId: string) {
    if (!window.confirm("Prekinuti vezu sa Gmail nalogom u JAKOV360?")) return;
    setPending(connectionId);
    setMessage("");
    try {
      const response = await fetch("/api/mail/gmail/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await response.json().catch(() => null) as {
        disconnected?: boolean;
        providerRevocationConfirmed?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.disconnected) {
        throw new Error(data?.error ?? "Povezivanje nije prekinuto.");
      }
      setMessage(data.providerRevocationConfirmed
        ? "Gmail je odvezan, a Google token opozvan."
        : "Lokalni pristup je uklonjen. Opoziv kod Google-a nije potvrđen; proverite dozvole u Google nalogu.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prekid veze nije uspeo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="dashboard-card" aria-label="Gmail povezivanje — test">
      <h2>Gmail — testno povezivanje</h2>
      <p>Posebna dozvola samo za slanje poruka. JAKOV360 ovim korakom ne čita vaš Gmail inbox.</p>
      <p>Aktivno je samo za odobren testni nalog na acceptance staging-u.</p>
      {connections.length ? (
        <ul>
          {connections.map((connection) => (
            <li key={connection.id}>
              <strong>{connection.emailAddress}</strong>{" "}
              <button
                className="secondary-button"
                type="button"
                disabled={pending !== null}
                onClick={() => void disconnect(connection.id)}
              >
                {pending === connection.id ? "Prekidanje..." : "Prekini vezu"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nijedan Gmail nalog nije povezan.</p>
      )}
      <p>
        <a className="primary-link" href="/api/mail/gmail/start">
          {connections.length ? "Ponovo odobri Gmail pristup" : "Poveži Gmail (test)"}
        </a>
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
