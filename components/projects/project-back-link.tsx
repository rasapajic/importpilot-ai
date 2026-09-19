export const PROJECTS_LIST_ROUTE = "/dashboard";

export function ProjectBackLink({ label }: { label: string }) {
  return (
    <a className="project-back-link" href={PROJECTS_LIST_ROUTE}>
      {label}
    </a>
  );
}
