import Link from "next/link";

import { requireSession } from "@/modules/auth/infrastructure/session";
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
  },
  de: {
    title: "Konto",
    signedInAs: "Angemeldet als",
    name: "Name",
    email: "E-Mail",
    organization: "Unternehmen",
    role: "Rolle",
    back: "Zurück zu den Suchen",
  },
  en: {
    title: "Account",
    signedInAs: "Signed in as",
    name: "Name",
    email: "Email",
    organization: "Company",
    role: "Role",
    back: "Back to searches",
  },
};

export default async function AccountPage() {
  const { user, membership } = await requireSession();
  const locale = await getServerLocale();
  const text = copy[locale];

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

        <Link className="primary-link" href="/dashboard">{text.back}</Link>
      </section>
    </main>
  );
}
