export class SupplierSearchRequestTimeoutError extends Error {
  constructor() {
    super("Supplier search request exceeded its maximum duration.");
    this.name = "SupplierSearchRequestTimeoutError";
  }
}

/**
 * Bounds a supplier search without discarding a result that becomes ready as
 * the deadline aborts in-flight provider work. Callers should pass the signal
 * into the provider request. After abort, a short grace period lets that
 * request return either live/partial offers or the last saved cache entry.
 */
export async function withSearchDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  graceMs = 1_500,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = operation(controller.signal);

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new SupplierSearchRequestTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (!(error instanceof SupplierSearchRequestTimeoutError)) throw error;
    const late = await Promise.race([
      work.then(
        (value) => ({ status: "value" as const, value }),
        (caught: unknown) => ({ status: "error" as const, error: caught }),
      ),
      new Promise<{ status: "timeout" }>((resolve) => {
        setTimeout(() => resolve({ status: "timeout" }), graceMs);
      }),
    ]);
    if (late.status === "value") return late.value;
    if (late.status === "error") throw late.error;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
