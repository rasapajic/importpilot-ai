import { describe, expect, it } from "vitest";

import {
  shouldAutoScrollWorkflowStep,
  shouldOpenWorkflowStep,
} from "../../modules/projects/domain/workflow-step-interaction";

describe("workflow step interaction", () => {
  it("opens an active or explicitly forced step", () => {
    expect(shouldOpenWorkflowStep({
      status: "ACTIVE",
      forceOpen: false,
    })).toBe(true);
    expect(shouldOpenWorkflowStep({
      status: "COMPLETED",
      forceOpen: true,
    })).toBe(true);
  });

  it("does not force a completed step closed after it was opened by the browser", () => {
    expect(shouldOpenWorkflowStep({
      status: "COMPLETED",
      forceOpen: false,
    })).toBe(false);
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
