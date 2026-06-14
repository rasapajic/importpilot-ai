export const dashboardPrimaryActions = [
  {
    href: "/projects/new",
    label: "New search",
    help: "Start with a product name, quantity and target country. ImportPilot will try to find offers.",
  },
  {
    href: "/projects/new?mode=url",
    label: "Paste product link",
    help: "Use this when you already have a link from Alibaba, Made-in-China or a similar site.",
  },
] as const;
