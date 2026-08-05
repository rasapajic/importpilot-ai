export const dashboardPrimaryActions = [
  {
    href: "/projects/new",
    key: "describe",
  },
  {
    href: "/projects/new?mode=url",
    key: "url",
  },
] as const;

export type DashboardPrimaryActionKey = (typeof dashboardPrimaryActions)[number]["key"];
