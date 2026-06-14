import Link from "next/link";

export const PROJECTS_LIST_ROUTE = "/dashboard";

export function ProjectBackLink({ label }: { label: string }) {
  return (
    <Link className="project-back-link" href={PROJECTS_LIST_ROUTE}>
      {label}
    </Link>
  );
}
