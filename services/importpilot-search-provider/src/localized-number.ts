type LocalizedNumberKind = "price" | "quantity";

/**
 * Parses marketplace numbers without turning a decimal comma into a thousands
 * separator. Alibaba localizes the same value as `5.45`, `5,45`, `1,234.56`
 * or `1.234,56` depending on the visitor locale.
 */
export function parseLocalizedNumber(
  value: unknown,
  kind: LocalizedNumberKind = "price",
) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const token = value.match(/[0-9][0-9.,\s\u00a0]*/)?.[0]
    ?.replace(/[\s\u00a0]/g, "")
    .replace(/[.,]+$/, "");
  if (!token) return null;

  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  let normalized = token;

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = token
      .replaceAll(thousandsSeparator, "")
      .replace(decimalSeparator, ".");
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const parts = token.split(separator);
    const tail = parts.at(-1) ?? "";
    const isGroupedInteger = kind === "quantity" ||
      (tail.length === 3 && parts.length > 1);
    normalized = isGroupedInteger
      ? parts.join("")
      : `${parts.slice(0, -1).join("")}.${tail}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
