import { notFound } from "next/navigation";

import { SupplierInboxView } from "@/components/projects/supplier-inbox-view";
import { ProjectBackLink } from "@/components/projects/project-back-link";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { getProjectSupplierInbox } from "@/modules/supplier-inbox/application/inbox-query";
import { inboxCopy } from "@/modules/supplier-inbox/domain/copy";
import { getProject } from "@/modules/projects/application/project-service";

export const dynamic = "force-dynamic";

export default async function SupplierInboxPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const auth = await requireSession();
  const locale = await getServerLocale();
  const labels = inboxCopy(locale);
  const { projectId } = await params;
  const project = await getProject(projectId, auth.membership.organizationId);
  if (!project) notFound();
  const inbox = await getProjectSupplierInbox(projectId, auth.membership.organizationId);
  if (!inbox) notFound();

  return (
    <main className="dashboard-shell project-page">
      <nav aria-label={labels.back}>
        <ProjectBackLink label={labels.back} href={`/projects/${project.id}`} />
      </nav>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">{labels.noOrder}</p>
          <h1>{labels.title}</h1>
        </div>
      </header>
      <SupplierInboxView model={inbox} locale={locale} projectId={project.id} />
    </main>
  );
}
