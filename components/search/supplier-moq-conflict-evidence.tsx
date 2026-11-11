"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import type { SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";

type Props = { preview: SupplierOfferUrlPreview };
type ConflictCopy = {
  title: string;
  supplierFaq: string;
  exactCatalog: string;
  publicRange: string;
  note: string;
  source: string;
  unit: string;
  alignedTitle: string;
  alignedNote: string;
  unverifiedTitle: string;
  unverifiedNote: string;
  lockedFields: string;
};

const copy: Record<Locale, ConflictCopy> = {
  sr: {
    title: "Različite minimalne količine — nije potvrđeno",
    supplierFaq: "Opšti FAQ dobavljača",
    exactCatalog: "Katalog ovog proizvoda",
    publicRange: "Javno oglašena FOB cena",
    note: "Ovi podaci nisu potvrđena ponuda. Nijedan MOQ ni cena nisu automatski uneti u ponudu ili obračun uvoza. Potrebna je potvrda dobavljača.",
    source: "Proveri originalni katalog",
    unit: "kom.",
    lockedFields: "Polja za cenu i MOQ su zaključana dok ne dobijemo potvrdu dobavljača. Proizvod se može dodati bez tih podataka.",
    alignedTitle: "FAQ i katalog navode isti MOQ — ponuda nije potvrđena",
    alignedNote: "Oba javna izvora navode istu minimalnu količinu, ali to nije potvrđena ponuda dobavljača. Javno oglašena cena i MOQ nisu uneti u obračun uvoza.",
    unverifiedTitle: "MOQ iz FAQ-a — nije potvrđen za ovaj proizvod",
    unverifiedNote: "Nije dobijen pouzdan podatak iz kataloga ovog proizvoda (stranica može biti blokirana ili je limit zahteva dostignut). FAQ je samo informacija, ne potvrda količine. Cena i MOQ nisu uneti u ponudu ni u obračun uvoza.",
  },
  de: {
    title: "Abweichende Mindestmengen — nicht bestätigt",
    supplierFaq: "Allgemeine Lieferanten-FAQ",
    exactCatalog: "Katalog für dieses Produkt",
    publicRange: "Öffentlich angegebener FOB-Preis",
    note: "Dies ist kein bestätigtes Angebot. Weder Mindestmenge noch Preis werden automatisch für ein Angebot oder die Einfuhrkosten verwendet. Lieferantenbestätigung erforderlich.",
    source: "Originalkatalog prüfen",
    unit: "Stück",
    lockedFields: "Preis und Mindestmenge bleiben bis zur Lieferantenbestätigung gesperrt. Das Produkt kann ohne diese Daten hinzugefügt werden.",
    alignedTitle: "FAQ und Katalog nennen dieselbe MOQ — Angebot unbestätigt",
    alignedNote: "Beide öffentlichen Quellen nennen die gleiche Mindestmenge, aber kein bestätigtes Lieferantenangebot. Weder Preis noch MOQ werden für die Einfuhrkosten übernommen.",
    unverifiedTitle: "MOQ aus Lieferanten-FAQ — für dieses Produkt unbestätigt",
    unverifiedNote: "Für dieses Produkt liegen keine überprüften Katalogdaten vor (Quelle gesperrt oder Abruflimit erreicht). Die FAQ ist nur ein Hinweis, keine verbindliche Mindestmenge. Weder Preis noch MOQ fließen in Angebot oder Einfuhrkosten ein.",
  },
  en: {
    title: "Conflicting minimum orders — unconfirmed",
    supplierFaq: "General supplier FAQ",
    exactCatalog: "Exact-product catalog",
    publicRange: "Publicly advertised FOB price",
    note: "This is not a confirmed supplier quote. Neither MOQ nor price is automatically used in an offer or landed-cost calculation. Supplier confirmation is required.",
    source: "Check original catalog",
    unit: "pieces",
    lockedFields: "Price and MOQ fields remain locked until the supplier confirms them. You can add the product without these details.",
    alignedTitle: "FAQ and catalog agree on MOQ — quote unconfirmed",
    alignedNote: "Both public listings state the same minimum order, but neither is a confirmed supplier quote. Public price and MOQ are not used for landed cost.",
    unverifiedTitle: "Supplier FAQ MOQ — not verified for this product",
    unverifiedNote: "Exact-product catalog evidence was not obtained (the source may be blocked or the request limit reached). The supplier FAQ is informational only, not a confirmed product minimum. No price or MOQ is applied to an offer or landed-cost calculation.",
  },
};

/**
 * Source comparison ONLY. Never projects catalog prices or either MOQ into
 * SupplierOfferSearchResult, quantity-tier selection or landed-cost inputs.
 */
export function SupplierMoqConflictEvidence({ preview }: Props) {
  const conflict = preview.moqConflictEvidence;
  const aligned = preview.moqAlignedFaqEvidence;
  const catalogEvidence = conflict ?? aligned;
  const unverified = preview.moqUnverifiedFaqEvidence;
  const { locale } = useI18n();
  if (!catalogEvidence && !unverified) return null;
  const c = copy[locale];
  const format = new Intl.NumberFormat(
    locale === "sr" ? "sr-RS" : locale === "de" ? "de-AT" : "en-GB",
    { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  );
  const money = new Intl.NumberFormat(
    locale === "sr" ? "sr-RS" : locale === "de" ? "de-AT" : "en-GB",
    { minimumFractionDigits: 2, maximumFractionDigits: 4 },
  );
  const range = catalogEvidence ? [
    money.format(Number(catalogEvidence.lowPrice)),
    money.format(Number(catalogEvidence.highPrice)),
  ].join("–") : null;
  const title = conflict ? c.title : aligned ? c.alignedTitle : c.unverifiedTitle;
  const faqMoq = catalogEvidence?.faqMinimumOrderQuantity ??
    unverified?.faqMinimumOrderQuantity ?? null;

  return (
    <section aria-label={title} className="warning-text supplier-moq-evidence" role="status">
      <strong>{title}</strong>
      <dl>
        {faqMoq !== null && (
          <div>
            <dt>{c.supplierFaq}</dt>
            <dd>{format.format(faqMoq)} {c.unit}</dd>
          </div>
        )}
        {catalogEvidence && (
          <>
            <div>
              <dt>{c.exactCatalog}</dt>
              <dd>{format.format(catalogEvidence.catalogMinimumOrderQuantity)} {c.unit}</dd>
            </div>
            <div>
              <dt>{c.publicRange}</dt>
              <dd>{range} {catalogEvidence.currency}/{catalogEvidence.unit}</dd>
            </div>
          </>
        )}
      </dl>
      <p>{conflict ? c.note : aligned ? c.alignedNote : c.unverifiedNote}</p>
      <p>{c.lockedFields}</p>
      {catalogEvidence && (
        <a href={catalogEvidence.sourceUrl} rel="noopener noreferrer" target="_blank">
          {c.source}
        </a>
      )}
    </section>
  );
}
