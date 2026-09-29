import { ProjectWorkflowPage } from "@/components/projects/project-workflow-page";

export default async function ProjectAnalysisPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ activityType?: string; edit?: string; importUrl?: string; offer?: string; rfq?: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkflowPage currentStep="ANALYSIS" projectId={projectId} searchParams={await searchParams} />;
}
