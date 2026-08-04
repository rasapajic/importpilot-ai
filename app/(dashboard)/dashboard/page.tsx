import Link from "next/link";

import { DashboardPrimaryActions } from "@/components/dashboard/dashboard-primary-actions";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import { getServerLocale } from "@/modules/i18n/server";
import { getStatusLabel, translateText } from "@/modules/i18n/translations";
import { getDashboardProjectStage } from "@/modules/projects/application/dashboard-project-stage";
import { listProjects } from "@/modules/projects/application/project-service";
import { listProjectsSchema } from "@/modules/projects/domain/validation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { membership } = await requireSession();
  const locale = await getServerLocale();
  const raw = await searchParams;
  const query = listProjectsSchema.parse({
    search: typeof raw.search === "string" ? raw.search : "",
    status: typeof raw.status === "string" && raw.status ? raw.status : undefined,
    completionStatus:
      typeof raw.completionStatus === "string" && raw.completionStatus
        ? raw.completionStatus
        : undefined,
    targetCountry:
      typeof raw.targetCountry === "string" && raw.targetCountry
        ? raw.targetCountry
        : undefined,
    page: typeof raw.page === "string" ? raw.page : 1,
    pageSize: 10,
  });
  const result = await listProjects(query, membership.organizationId);
  const hasActiveFilters = Boolean(
    query.search || query.status || query.completionStatus || query.targetCountry,
  );

  function projectStage(project: (typeof result.projects)[number]) {
    return translateText(
      getDashboardProjectStage({
        offerCount: project._count.offers,
        hasAssessment: project.offers.some((offer) => offer.assessments.length > 0),
        latestDecisionStatus: project.projectDecisions[0]?.status ?? null,
      }),
      locale,
    );
  }

  function pageUrl(page: number) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.status) params.set("status", query.status);
    if (query.completionStatus) params.set("completionStatus", query.completionStatus);
    if (query.targetCountry) params.set("targetCountry", query.targetCountry);
    params.set("page", String(page));
    return `/dashboard?${params}`;
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <h1>{translateText("Uporedite ponude i kupujte sigurnije", locale)}</h1>
          <p>{translateText("Dodajte ponude, izračunajte realnu cenu i donesite odluku za nekoliko minuta.", locale)}</p>
        </div>
      </header>
      <DashboardPrimaryActions />

      <h2 className="dashboard-section-title">{translateText("Your active searches", locale)}</h2>
      <details className="dashboard-filters" open={hasActiveFilters}>
        <summary><span aria-hidden="true">⚙</span> {translateText("Filteri", locale)}</summary>
        <form className="filters">
          <input defaultValue={query.search} name="search" placeholder={translateText("Pretraži kupovine", locale)} />
          <select defaultValue={query.status ?? ""} name="status">
            <option value="">{translateText("Svi statusi", locale)}</option>
            <option value="DRAFT">{getStatusLabel("DRAFT", locale)}</option>
            <option value="COLLECTING_OFFERS">{getStatusLabel("COLLECTING_OFFERS", locale)}</option>
            <option value="ANALYZING">{getStatusLabel("ANALYZING", locale)}</option>
            <option value="READY">{getStatusLabel("READY", locale)}</option>
          </select>
          <select defaultValue={query.completionStatus ?? ""} name="completionStatus">
            <option value="">{translateText("Svi statusi završetka", locale)}</option>
            <option value="ACTIVE">{getStatusLabel("ACTIVE", locale)}</option>
            <option value="DECIDED">{getStatusLabel("DECIDED", locale)}</option>
            <option value="COMPLETED">{getStatusLabel("COMPLETED", locale)}</option>
            <option value="ARCHIVED">{getStatusLabel("ARCHIVED", locale)}</option>
          </select>
          <input defaultValue={query.targetCountry} name="targetCountry" placeholder={translateText("Zemlja, npr. DE", locale)} maxLength={2} />
          <button type="submit">{translateText("Filtriraj", locale)}</button>
        </form>
      </details>

      <section className="project-list">
        {result.projects.map((project) => (
          <article className="project-row project-list-row" key={project.id}>
            <Link className="project-row-link" href={`/projects/${project.id}`}>
              <span className="project-card-content">
                <strong>{translateText(project.name, locale)}</strong>
                <span className="project-card-meta">
                  <small><span aria-hidden="true">📍</span> {getCountryDisplayName(project.targetCountry, locale)}</small>
                  <small><span aria-hidden="true">📦</span> {project.quantity} {translateText("kom", locale)}</small>
                  <small className="project-stage">{projectStage(project)}</small>
                </span>
              </span>
            </Link>
          </article>
        ))}
        {result.projects.length === 0 && (
          <div className="dashboard-card empty-state">
            <h2>{translateText("Nema projekata za izabrane filtere.", locale)}</h2>
            <p>{translateText("Očistite filtere ili kreirajte prvu kupovinu.", locale)}</p>
            <Link className="primary-link" href="/projects/new">{translateText("New search", locale)}</Link>
          </div>
        )}
      </section>

      {result.pagination.pageCount > 1 && (
        <nav className="pagination">
          {query.page > 1 && <Link href={pageUrl(query.page - 1)}>{translateText("Prethodna", locale)}</Link>}
          <span>{translateText("Strana", locale)} {query.page} {translateText("od", locale)} {result.pagination.pageCount}</span>
          {query.page < result.pagination.pageCount && <Link href={pageUrl(query.page + 1)}>{translateText("Sledeća", locale)}</Link>}
        </nav>
      )}
    </main>
  );
}
