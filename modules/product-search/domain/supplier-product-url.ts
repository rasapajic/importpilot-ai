const TRACKING_PARAMETER_PATTERN = /^(?:spm|utm_|src|source|ref|from|scm|pvid)/i;

/**
 * Produces a stable key for matching a supplier product page across repeated
 * searches. Tracking parameters and fragments must not disconnect an imported
 * offer from its later landed-cost and risk analysis.
 */
export function canonicalSupplierProductUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETER_PATTERN.test(parameter)) url.searchParams.delete(parameter);
    }
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}
