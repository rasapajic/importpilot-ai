export function serializeClientData<T>(value: T): T {
  const serialized = JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

  if (serialized === undefined) {
    throw new TypeError("Client data must be JSON-serializable.");
  }

  return JSON.parse(serialized) as T;
}
