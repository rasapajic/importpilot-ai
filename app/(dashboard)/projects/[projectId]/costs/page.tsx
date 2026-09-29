import { ProjectWorkflowPage } from "@/components/projects/project-workflow-page";

export default async function ProjectCostsPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ activityType?: string; edit?: string; importUrl?: string; offer?: string; rfq?: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkflowPage currentStep="COSTS" projectId={projectId} searchParams={await searchParams} />;
}
