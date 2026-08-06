"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { ProjectWorkflowStepStatus } from "@/modules/projects/domain/project-workflow";
import {
  resolveWorkflowStepOpenState,
  shouldAutoScrollWorkflowStep,
} from "@/modules/projects/domain/workflow-step-interaction";

export function ProjectWorkflowStep({
  number,
  title,
  status,
  summary,
  helperText,
  statusLabel,
  lockedText,
  children,
  forceOpen = false,
  id,
}: {
  number: number;
  title: string;
  status: ProjectWorkflowStepStatus;
  summary: ReactNode;
  helperText?: string;
  statusLabel: string;
  lockedText: string;
  children: ReactNode;
  forceOpen?: boolean;
  id?: string;
}) {
  const stepRef = useRef<HTMLDetailsElement>(null);
  const hasMounted = useRef(false);
  const [isOpen, setIsOpen] = useState(status === "ACTIVE" || forceOpen);

  useEffect(() => {
    setIsOpen((currentOpen) => resolveWorkflowStepOpenState({
      currentOpen,
      status,
      forceOpen,
    }));

    if (shouldAutoScrollWorkflowStep({
      hasMounted: hasMounted.current,
      status,
      forceOpen,
    })) {
      stepRef.current?.scrollIntoView({ block: "start" });
    }
    hasMounted.current = true;
  }, [forceOpen, status]);

  if (status === "HIDDEN") return null;

  const heading = (
    <>
      <span className="workflow-step-number">{number}</span>
      <span className="workflow-step-heading">
        <strong>{title}</strong>
        <small>{summary}</small>
      </span>
      <span className={`workflow-step-badge workflow-step-badge-${status.toLowerCase()}`}>
        {statusLabel}
      </span>
    </>
  );

  if (status === "LOCKED") {
    return (
      <section className="workflow-step workflow-step-locked" id={id}>
        <div className="workflow-step-summary">{heading}</div>
        <p className="workflow-locked-text">{lockedText}</p>
      </section>
    );
  }

  return (
    <details
      className={`workflow-step workflow-step-${status.toLowerCase()}`}
      id={id}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
      ref={stepRef}
    >
      <summary className="workflow-step-summary">{heading}</summary>
      <div className="workflow-step-content">
        {helperText && <p className="workflow-helper-text">{helperText}</p>}
        {children}
      </div>
    </details>
  );
}
