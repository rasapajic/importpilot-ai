export class UnexpectedApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly contentType: string,
  ) {
    super(message);
    this.name = "UnexpectedApiResponseError";
  }
}

/**
 * Reads a JSON API response without ever surfacing raw HTML or JSON parser
 * exceptions to the user. Next.js development error pages, authentication
 * redirects and upstream proxy pages may all be HTML; callers receive their
 * localized fallback message instead of `Unexpected token '<'`.
 */
export async function readApiJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!text.trim()) {
    throw new UnexpectedApiResponseError(
      fallbackMessage,
      response.status,
      contentType,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn("[api-response] non-json response", {
        status: response.status,
        contentType,
      });
    }
    throw new UnexpectedApiResponseError(
      fallbackMessage,
      response.status,
      contentType,
    );
  }
}
