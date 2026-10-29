export const PROJECTS_LIST_ROUTE = "/dashboard";

export function ProjectBackLink({
  label,
  href = PROJECTS_LIST_ROUTE,
}: {
  label: string;
  href?: string;
}) {
  return (
    <a className="project-back-link" href={href}>
      {label}
    </a>
  );
}
