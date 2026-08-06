import type { ProjectWorkflowStepStatus } from "./project-workflow";

type WorkflowStepOpenStateInput = {
  currentOpen: boolean;
  status: ProjectWorkflowStepStatus;
  forceOpen: boolean;
};

type WorkflowStepScrollInput = {
  hasMounted: boolean;
  status: ProjectWorkflowStepStatus;
  forceOpen: boolean;
};

export function resolveWorkflowStepOpenState({
  currentOpen,
  status,
  forceOpen,
}: WorkflowStepOpenStateInput) {
  return forceOpen || status === "ACTIVE" ? true : currentOpen;
}

export function shouldAutoScrollWorkflowStep({
  hasMounted,
  status,
  forceOpen,
}: WorkflowStepScrollInput) {
  return forceOpen || (!hasMounted && status === "ACTIVE");
}
