import { describe, expect, it } from "vitest";

import {
  resolveWorkflowStepOpenState,
  shouldAutoScrollWorkflowStep,
} from "../../modules/projects/domain/workflow-step-interaction";

describe("workflow step interaction", () => {
  it("keeps an already open offer step open when it becomes completed", () => {
    expect(resolveWorkflowStepOpenState({
      currentOpen: true,
      status: "COMPLETED",
      forceOpen: false,
    })).toBe(true);
  });

  it("opens a step when it becomes active", () => {
    expect(resolveWorkflowStepOpenState({
      currentOpen: false,
      status: "ACTIVE",
      forceOpen: false,
    })).toBe(true);
  });

  it("does not auto-scroll to a newly activated next step after the page is mounted", () => {
    expect(shouldAutoScrollWorkflowStep({
      hasMounted: true,
      status: "ACTIVE",
      forceOpen: false,
    })).toBe(false);
  });

  it("still auto-scrolls on the initial active step or an explicitly forced step", () => {
    expect(shouldAutoScrollWorkflowStep({
      hasMounted: false,
      status: "ACTIVE",
      forceOpen: false,
    })).toBe(true);
    expect(shouldAutoScrollWorkflowStep({
      hasMounted: true,
      status: "COMPLETED",
      forceOpen: true,
    })).toBe(true);
  });
});
