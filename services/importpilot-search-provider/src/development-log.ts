export type DevelopmentLogger = (
  event: string,
  details?: Record<string, unknown>,
) => void;

const PRODUCTION_SAFE_EVENTS = new Set([
  "provider_attempt_failed",
]);

export function createDevelopmentLogger(
  environment = process.env.NODE_ENV,
  sink: (message: string) => void = console.info,
): DevelopmentLogger {
  return (event, details = {}) => {
    if (environment !== "development" && !PRODUCTION_SAFE_EVENTS.has(event)) return;

    sink(JSON.stringify({
      service: "importpilot-search-provider",
      event,
      ...details,
    }));
  };
}
