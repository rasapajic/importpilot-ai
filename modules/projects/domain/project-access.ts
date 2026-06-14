export const DEMO_PROJECT_PREFIX = "[DEMO]";

export function isDemoProjectName(name: string) {
  return name.startsWith(DEMO_PROJECT_PREFIX);
}
