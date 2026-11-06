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
  },
  de: {
    title: "Abweichende Mindestmengen — nicht bestätigt",
    supplierFaq: "Allgemeine Lieferanten-FAQ",
    exactCatalog: "Katalog für dieses Produkt",
    publicRange: "Öffentlich angegebener FOB-Preis",
    note: "Dies ist kein bestätigtes Angebot. Weder Mindestmenge noch Preis werden automatisch für ein Angebot oder die Einfuhrkosten verwendet. Lieferantenbestätigung erforderlich.",
    source: "Originalkatalog prüfen",
    unit: "Stück",
  },
  en: {
    title: "Conflicting minimum orders — unconfirmed",
    supplierFaq: "General supplier FAQ",
    exactCatalog: "Exact-product catalog",
    publicRange: "Publicly advertised FOB price",
    note: "This is not a confirmed supplier quote. Neither MOQ nor price is automatically used in an offer or landed-cost calculation. Supplier confirmation is required.",
    source: "Check original catalog",
    unit: "pieces",
  },
};

/**
 * Source comparison ONLY. Never projects catalog prices or either MOQ into
 * SupplierOfferSearchResult, quantity-tier selection or landed-cost inputs.
 */
export function SupplierMoqConflictEvidence({ preview }: Props) {
  const conflict = preview.moqConflictEvidence;
  const { locale } = useI18n();
  if (!conflict) return null;
  const c = copy[locale];
  const format = new Intl.NumberFormat(
    locale === "sr" ? "sr-RS" : locale === "de" ? "de-AT" : "en-GB",
    { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  );
  const money = new Intl.NumberFormat(
    locale === "sr" ? "sr-RS" : locale === "de" ? "de-AT" : "en-GB",
    { minimumFractionDigits: 2, maximumFractionDigits: 4 },
  );
  const range = [
    money.format(Number(conflict.lowPrice)),
    money.format(Number(conflict.highPrice)),
  ].join("–");

  return (
    <section aria-label={c.title} className="warning-text" role="status">
      <strong>{c.title}</strong>
      <dl>
        <div>
          <dt>{c.supplierFaq}</dt>
          <dd>{format.format(conflict.faqMinimumOrderQuantity)} {c.unit}</dd>
        </div>
        <div>
          <dt>{c.exactCatalog}</dt>
          <dd>{format.format(conflict.catalogMinimumOrderQuantity)} {c.unit}</dd>
        </div>
        <div>
          <dt>{c.publicRange}</dt>
          <dd>{range} {conflict.currency}/{conflict.unit}</dd>
        </div>
      </dl>
      <p>{c.note}</p>
      <a href={conflict.sourceUrl} rel="noopener noreferrer" target="_blank">
        {c.source}
      </a>
    </section>
  );
}
