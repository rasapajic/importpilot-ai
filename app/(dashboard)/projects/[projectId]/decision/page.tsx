import { ProjectWorkflowPage } from "@/components/projects/project-workflow-page";

export default async function ProjectDecisionPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ activityType?: string; edit?: string; importUrl?: string; offer?: string; rfq?: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkflowPage currentStep="DECISION" projectId={projectId} searchParams={await searchParams} />;
}
