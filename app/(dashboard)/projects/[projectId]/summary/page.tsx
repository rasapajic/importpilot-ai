import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/decisions/print-button";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getLatestProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { findOrganizationProject } from "@/modules/projects/application/project-service";
import { getServerLocale } from "@/modules/i18n/server";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import { getStatusLabel, translateBusinessText, translateText } from "@/modules/i18n/translations";

export default async function ProjectSummaryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const auth = await requireSession();
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const { projectId } = await params;
  const [project, decision] = await Promise.all([
    findOrganizationProject(projectId, auth.membership.organizationId),
    getLatestProjectDecision(projectId, auth.membership.organizationId),
  ]);
  if (!project || !decision) notFound();
  const targetCountryName = getCountryDisplayName(project.targetCountry, locale);
  const summary = decision.summarySnapshot;
  const best = summary.bestOverallOffer;

  return (
    <main className="print-summary">
      <div className="print-toolbar no-print">
        <Link href={`/projects/${projectId}`}>{t("Nazad na projekat")}</Link>
        <PrintButton />
      </div>
      <header>
        <p className="eyebrow">ImportPilot AI · {t("Finalna preporuka projekta")}</p>
        <h1>{project.name}</h1>
        <p>{t("Ciljna zemlja")}: {targetCountryName} · {t("Količina")}: {project.quantity} · {t("Ciljna marža")}: {project.targetMargin.toString()}%</p>
      </header>
      <section className="print-decision">
        <h2>{getStatusLabel(decision.status, locale)}</h2>
        <p>{translateBusinessText(decision.decisionReason, locale)}</p>
      </section>
      <section>
        <h2>{t("Pregled projekta")}</h2>
        <dl className="print-grid">
          <div><dt>Broj ponuda</dt><dd>{summary.offerCount}</dd></div>
          <div><dt>Ocenjene ponude</dt><dd>{summary.assessedOfferCount}</dd></div>
          <div><dt>Uporedive ponude</dt><dd>{summary.comparableOfferCount} · {summary.primaryCurrency ?? "N/A"}</dd></div>
          <div><dt>Neuporedive ponude</dt><dd>{summary.incomparableOfferCount}</dd></div>
        </dl>
      </section>
      <section>
        <h2>Najbolja ponuda</h2>
        {best ? (
          <dl className="print-grid">
            <div><dt>Dobavljač</dt><dd>{best.supplierName}</dd></div>
            <div><dt>Ukupna ocena</dt><dd>{best.assessment?.overallScore ?? "N/A"}/100</dd></div>
            <div><dt>Rizik</dt><dd>{best.assessment?.supplierRiskScore ?? "N/A"}/100</dd></div>
            <div><dt>{t("Ukupna nabavna cena")}</dt><dd>{best.landedCostTotal ?? "N/A"} {best.currency ?? ""}</dd></div>
            <div><dt>{t("Ukupna nabavna cena po jedinici")}</dt><dd>{best.landedCostPerUnit ?? "N/A"} {best.currency ?? ""}</dd></div>
            <div><dt>Bruto marža</dt><dd>{best.grossMarginPercent ?? "N/A"}%</dd></div>
          </dl>
        ) : <p>Nema dovoljno podataka za izbor najbolje ponude.</p>}
      </section>
      <section>
        <h2>Rizici i sledeći koraci</h2>
        <ul className="checklist print-checklist">
          {decision.actionChecklist.map((item) => (
            <li key={item.key}><strong>{translateBusinessText(item.label, locale)}</strong><span>{translateBusinessText(item.reason, locale)}</span></li>
          ))}
        </ul>
      </section>
      <footer>
        Generisano {decision.createdAt.toLocaleString("sr-Latn")} · {decision.decisionVersion}
      </footer>
    </main>
  );
}
