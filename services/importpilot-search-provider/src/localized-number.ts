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

const ADVERTISED_RANGE = /([0-9][0-9.,]*)\s*[-–—]\s*([0-9][0-9.,]*)/;

/**
 * Reads an advertised unit-price string. A range is kept only when the source
 * text itself contains two prices separated by a dash. The high bound is never
 * invented from a single number.
 */
export function parseAdvertisedPriceBounds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return { low: value, high: null as number | null };
  }
  if (typeof value !== "string") return null;
  const range = value.match(ADVERTISED_RANGE);
  if (range) {
    const low = parseLocalizedNumber(range[1], "price");
    const high = parseLocalizedNumber(range[2], "price");
    if (low === null || low < 0) return null;
    if (high === null || high <= low) return { low, high: null as number | null };
    return { low, high };
  }
  const low = parseLocalizedNumber(value, "price");
  if (low === null || low < 0) return null;
  return { low, high: null as number | null };
}
