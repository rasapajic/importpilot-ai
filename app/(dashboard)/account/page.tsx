import Link from "next/link";

import { requireSession } from "@/modules/auth/infrastructure/session";
import { listGmailMailboxConnections } from "@/modules/negotiation/application/gmail-mailbox-connection-service";
import {
  assertGmailAcceptanceEnrollment,
  gmailConnectionConfig,
  gmailConnectionEnabled,
} from "@/modules/negotiation/infrastructure/gmail-connect-oauth";
import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";

import styles from "./account.module.css";

type AccountCopy = {
  title: string;
  signedInAs: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  back: string;
  gmailTitle: string;
  gmailDescription: string;
  gmailConnect: string;
  gmailDisconnect: string;
  gmailDisabled: string;
};

const copy: Record<Locale, AccountCopy> = {
  sr: {
    title: "Nalog",
    signedInAs: "Prijavljeni ste kao",
    name: "Ime",
    email: "Email",
    organization: "Kompanija",
    role: "Uloga",
    back: "Nazad na pretrage",
    gmailTitle: "Povezani Gmail",
    gmailDescription: "Povezivanje Gmail naloga je odvojeno od Google prijave. Povezivanje samo po sebi ne šalje poruke.",
    gmailConnect: "Poveži Gmail za slanje",
    gmailDisconnect: "Prekini vezu",
    gmailDisabled: "Gmail povezivanje nije aktivirano na ovom testnom okruženju.",
  },
  de: {
    title: "Konto",
    signedInAs: "Angemeldet als",
    name: "Name",
    email: "E-Mail",
    organization: "Unternehmen",
    role: "Rolle",
    back: "Zurück zu den Suchen",
    gmailTitle: "Verbundenes Gmail",
    gmailDescription: "Das Verbinden des Postfachs ist unabhängig von der Google-Anmeldung. Es werden keine Nachrichten automatisch versendet.",
    gmailConnect: "Gmail zum Senden verbinden",
    gmailDisconnect: "Verbindung trennen",
    gmailDisabled: "Die Gmail-Verbindung ist in dieser Testumgebung noch nicht aktiviert.",
  },
  en: {
    title: "Account",
    signedInAs: "Signed in as",
    name: "Name",
    email: "Email",
    organization: "Company",
    role: "Role",
    back: "Back to searches",
    gmailTitle: "Connected Gmail",
    gmailDescription: "Mailbox connection is separate from Google sign-in. Connecting alone never sends a message.",
    gmailConnect: "Connect Gmail for sending",
    gmailDisconnect: "Disconnect",
    gmailDisabled: "Gmail connection is not enabled in this test environment.",
  },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { user, membership } = await requireSession();
  const locale = await getServerLocale();
  const text = copy[locale];
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const enabled = canManage && gmailConnectionEnabled();
  let configured = false;
  if (enabled) {
    try {
      assertGmailAcceptanceEnrollment({
        organizationId: membership.organizationId,
        userId: user.id,
      });
      gmailConnectionConfig();
      configured = true;
    } catch {
      configured = false;
    }
  }
  // Previously connected accounts must remain disconnectable even if the
  // new-connection feature flag or acceptance allowlist later excludes this user.
  const connections = canManage
    ? await listGmailMailboxConnections(membership.organizationId)
    : [];
  const message = (await searchParams).gmail;
  const notice = message === "connected" ? "Gmail nalog je povezan." :
    message === "disconnected" ? "Gmail veza je prekinuta." :
    message === "failed" ? "Gmail povezivanje nije uspelo." :
    message === "cancelled" ? "Povezivanje je otkazano." :
    message === "invalid-state" ? "Nevažeća Gmail autorizacija." :
    message === "unauthorized" ? "Nemate dozvolu za povezivanje." :
    null;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className="eyebrow">JAKOV360 · ImportPilot AI</p>
        <h1>{text.title}</h1>
        <p className={styles.signedInAs}>{text.signedInAs}</p>
        <strong className={styles.email}>{user.email}</strong>

        <dl className={styles.details}>
          <div>
            <dt>{text.name}</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>{text.email}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{text.organization}</dt>
            <dd>{membership.organization.name}</dd>
          </div>
          <div>
            <dt>{text.role}</dt>
            <dd>{membership.role}</dd>
          </div>
        </dl>

        {canManage && (
          <section className={styles.gmailSection} aria-label={text.gmailTitle}>
            <h2>{text.gmailTitle}</h2>
            <p>{text.gmailDescription}</p>
            {notice && <p role="status">{notice}</p>}
            {connections.map((connection) => (
              <div className={styles.gmailConnection} key={connection.id}>
                <strong>{connection.mailboxEmail}</strong>
                <form method="post" action="/api/mail/google/disconnect">
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <button type="submit">{text.gmailDisconnect}</button>
                </form>
              </div>
            ))}
            {configured ? (
              <form method="post" action="/api/mail/google/start">
                <button type="submit">{text.gmailConnect}</button>
              </form>
            ) : (
              <p className={styles.signedInAs}>{text.gmailDisabled}</p>
            )}
          </section>
        )}
        <Link className="primary-link" href="/dashboard">{text.back}</Link>
      </section>
    </main>
  );
}
