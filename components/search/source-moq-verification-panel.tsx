"use client";

import { useState } from "react";
import type { Locale } from "@/modules/i18n/translations";
import type { SupplierOfferSearchResult, SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";
import {
  reconcileSourceMoq,
  type SourceMoqEvidence,
} from "@/modules/product-search/domain/source-moq-reconciliation";

const labels = {
  sr: {
    check: "Proveri MOQ na originalnoj stranici",
    checking: "Provera izvornog oglasa...",
    unverified: "Podaci iz sačuvane pretrage — potrebno proveriti na originalnoj stranici.",
    failed: "Podaci sa originalne stranice nisu pouzdano dostupni. Sačuvani MOQ nije potvrđen.",
    differentSku: "Dobijeni podaci ne pripadaju istom URL-u proizvoda. Nisu primenjeni.",
    matched: "MOQ iz sačuvane pretrage i pročitanog izvora je isti.",
    different: (saved: number | null, page: number) =>
      `Neslaganje MOQ-a: sačuvana pretraga ${saved ?? "nepoznato"} kom., pročitana stranica ${page} kom. Sačuvana pretraga nije izmenjena.`,
    checked: (when: string) => `Vreme odgovora servisa: ${when}. To nije pisana potvrda prodavca niti garancija trenutne cene.`,
  },
  de: {
    check: "MOQ auf der Originalseite prüfen",
    checking: "Produktseite wird geprüft...",
    unverified: "Gespeicherte Suchdaten — auf der Originalseite zu prüfen.",
    failed: "Die Originalseite konnte nicht zuverlässig gelesen werden. Die gespeicherte MOQ ist nicht bestätigt.",
    differentSku: "Die gelesenen Daten gehören nicht zur selben Produkt-URL und wurden nicht angewandt.",
    matched: "Die gespeicherte MOQ und die gelesene MOQ stimmen überein.",
    different: (saved: number | null, page: number) =>
      `MOQ-Abweichung: gespeicherte Suche ${saved ?? "unbekannt"} Stk., gelesene Seite ${page} Stk. Die gespeicherten Daten wurden nicht geändert.`,
    checked: (when: string) => `Zeitpunkt der Dienstantwort: ${when}. Keine schriftliche Lieferantenbestätigung oder Preisgarantie.`,
  },
  en: {
    check: "Check MOQ on original product page",
    checking: "Checking the source page...",
    unverified: "Saved search data — needs checking against the original product page.",
    failed: "The original page could not be read reliably. Saved MOQ remains unverified.",
    differentSku: "The returned page does not match this exact product URL and was not applied.",
    matched: "Saved and page MOQ match.",
    different: (saved: number | null, page: number) =>
      `MOQ mismatch: saved search ${saved ?? "unknown"} pcs, page reading ${page} pcs. Saved data was not changed.`,
    checked: (when: string) => `Service response time: ${when}. Not a written supplier quote or guarantee of current price.`,
  },
} as const;

export function SourceMoqVerificationPanel({
  projectId,
  result,
  locale,
  cachedResult,
  evidence,
  onEvidence,
}: {
  projectId: string;
  result: SupplierOfferSearchResult;
  cachedResult: boolean;
  locale: Locale;
  evidence: SourceMoqEvidence | undefined;
  onEvidence: (evidence: SourceMoqEvidence) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = labels[locale];

  async function checkSource() {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/supplier-search/url-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ productUrl: result.productUrl }),
      });
      const payload = await response.json().catch(() => null) as {
        preview?: SupplierOfferUrlPreview;
        checkedAt?: string;
      } | null;
      const next = reconcileSourceMoq(
        result,
        response.ok ? payload?.preview ?? null : null,
        response.ok ? payload?.checkedAt ?? null : null,
      );
      onEvidence(next);
      setFailed(!response.ok || next.status === "NOT_VERIFIED" || next.status === "URL_MISMATCH");
    } catch {
      onEvidence(reconcileSourceMoq(result, null, null));
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="source-moq-check" style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      {(cachedResult || evidence) && (
        <p className="muted-text" role="status">
          {evidence?.status === "URL_MISMATCH"
            ? text.differentSku
            : evidence?.status === "DIFFERENT" && evidence.pageMoq !== null
              ? text.different(evidence.cachedMoq, evidence.pageMoq)
              : evidence?.status === "MATCHED"
                ? text.matched
                : text.unverified}
        </p>
      )}
      {(evidence?.status === "DIFFERENT" || evidence?.status === "MATCHED") && evidence.checkedAt && (
        <p className="muted-text">{text.checked(evidence.checkedAt)}</p>
      )}
      {failed && <p className="supplier-terms-warning" role="alert">{text.failed}</p>}
      <button type="button" className="secondary-button" onClick={() => void checkSource()} disabled={checking}>
        {checking ? text.checking : text.check}
      </button>
    </div>
  );
}
