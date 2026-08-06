import type { ProjectWorkflowStepStatus } from "./project-workflow";

type WorkflowStepStateInput = {
  status: ProjectWorkflowStepStatus;
  forceOpen: boolean;
};

type WorkflowStepScrollInput = WorkflowStepStateInput & {
  hasMounted: boolean;
};

export function shouldOpenWorkflowStep({
  status,
  forceOpen,
}: WorkflowStepStateInput) {
  return forceOpen || status === "ACTIVE";
}

export function shouldAutoScrollWorkflowStep({
  hasMounted,
  status,
  forceOpen,
}: WorkflowStepScrollInput) {
  return forceOpen || (!hasMounted && status === "ACTIVE");
}
