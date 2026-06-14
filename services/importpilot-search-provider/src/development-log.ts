export type DevelopmentLogger = (
  event: string,
  details?: Record<string, unknown>,
) => void;

export function createDevelopmentLogger(
  environment = process.env.NODE_ENV,
  sink: (message: string) => void = console.info,
): DevelopmentLogger {
  if (environment !== "development") return () => undefined;

  return (event, details = {}) => {
    sink(JSON.stringify({
      service: "importpilot-search-provider",
      event,
      ...details,
    }));
  };
}
