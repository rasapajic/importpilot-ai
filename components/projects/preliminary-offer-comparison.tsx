import Link from "next/link";

import type { Locale } from "@/modules/i18n/translations";
import type { ExplicitProductConstraintStatus } from "@/modules/product-search/domain/explicit-product-constraints";
import {
  buildPreliminaryOfferComparison,
  comparisonInquiryPriority,
  orderPreliminaryComparisonRows,
  type PreliminaryComparisonInput,
  type PreliminaryComparisonPriceEvidence,
} from "@/modules/product-search/domain/preliminary-offer-comparison";

type Copy = {
  title: string;
  intro: string;
  supplier: string;
  product: string;
  moq: string;
  price: string;
  origin: string;
  incoterm: string;
  suitability: string;
  landedCost: string;
  landedBlocked: string;
  unknown: string;
  quoteRoute: string;
  leadTime: string;
  mixedRequest: string;
  mixedUnconfirmed: string;
  inquiry: string;
  inquiryPriority: (position: number) => string;
  inquiryNotComparable: string;
  excludedFromInquiry: string;
  freight: string;
  duty: string;
  vat: string;
  notEvidenced: string;
  openDetail: string;
  columnOrderNote: string;
  priceNotComparable: string;
  missingPrice: Record<"NO_PRODUCT_URL" | "NO_MATCHING_SEARCH_RESULT", string>;
  preliminaryAnalysis: string;
  confidence: string;
  mixedQuantityCaveat: (quantity: string | null) => string;
  evidence: Record<PreliminaryComparisonPriceEvidence, string>;
  fit: Record<ExplicitProductConstraintStatus, string>;
};

const copy: Record<Locale, Copy> = {
  sr: {
    title: "Preliminarno poređenje",
    intro: "Porede se samo podaci koji su već poznati. Nepoznate stavke ostaju nepoznate. Reklamirana cena nije nabavna cena i ne otvara obračun zarade.",
    supplier: "Dobavljač",
    product: "Proizvod",
    moq: "MOQ iz oglasa",
    price: "Cena",
    origin: "Poreklo",
    incoterm: "Incoterm",
    suitability: "Podudaranje proizvoda",
    landedCost: "Ukupan trošak uvoza",
    landedBlocked: "blokirano dok nema potvrđene nabavne cene",
    unknown: "nije poznato",
    quoteRoute: "Detalji i potvrda otvaraju samo tog dobavljača. Poruka se ne šalje sama i reklamirana cena se ne označava kao potvrđena.",
    leadTime: "Rok isporuke",
    mixedRequest: "Mešovite dioptrije i tražena količina",
    mixedUnconfirmed: "nije potvrđeno",
    inquiry: "Prioritet za upit",
    inquiryPriority: (position) => `Prioritet za upit ${position}`,
    inquiryNotComparable: "nema dovoljno uporedivih cena",
    excludedFromInquiry: "ne ulazi u red za upit",
    freight: "Transport",
    duty: "Carina",
    vat: "PDV",
    notEvidenced: "nije poznato — nema dokaza",
    openDetail: "Detalji i potvrda",
    columnOrderNote: "Redosled kolona je prioritet za upit po oglašenoj ceni. To nije redosled potvrđene nabavne cene ni ukupnog troška uvoza.",
    priceNotComparable: "Oglašene cene nisu isti osnov. Redosled nije napravljen po ceni jer nema dovoljno uporedivih dokaza.",
    missingPrice: {
      NO_PRODUCT_URL: "Ponuda nema adresu proizvoda, pa oglašena cena iz pretrage ne može da se poveže.",
      NO_MATCHING_SEARCH_RESULT: "Keš pretrage nema istu adresu proizvoda, pa oglašena cena nije preuzeta.",
    },
    preliminaryAnalysis: "Preliminarna analiza",
    confidence: "Pouzdanost podataka",
    mixedQuantityCaveat: (quantity) => quantity
      ? `Oglašena cena nije potvrđena za ${quantity} mešovitih komada.`
      : "Oglašena cena nije potvrđena za traženu mešovitu količinu.",
    evidence: {
      CONFIRMED_QUOTE: "Potvrđena pisana ponuda",
      ADVERTISED_RANGE: "Reklamirani raspon, nije čvrsta ponuda",
      ADVERTISED_PRICE: "Reklamirana cena, nije potvrđena nabavna cena",
      UNKNOWN: "Cena nije poznata",
    },
    fit: {
      NOT_APPLICABLE: "nije posebno provereno",
      COMPATIBLE: "fiksna dioptrija je navedena u izvoru",
      NEEDS_CONFIRMATION: "potrebna potvrda dobavljača",
      DISQUALIFIED: "ne odgovara zahtevu",
    },
  },
  de: {
    title: "Vorläufiger Vergleich",
    intro: "Verglichen werden nur bereits bekannte Angaben. Unbekannte Punkte bleiben unbekannt. Ein beworbener Preis ist kein Einkaufspreis und gibt keine Gewinnrechnung frei.",
    supplier: "Lieferant",
    product: "Produkt",
    moq: "MOQ aus der Anzeige",
    price: "Preis",
    origin: "Herkunft",
    incoterm: "Incoterm",
    suitability: "Produktpassung",
    landedCost: "Landed Cost",
    landedBlocked: "blockiert, bis ein Einkaufspreis bestätigt ist",
    unknown: "unbekannt",
    quoteRoute: "Details und Bestätigung öffnen nur diesen Lieferanten. Es wird nichts automatisch gesendet und kein beworbener Preis als bestätigt markiert.",
    leadTime: "Lieferzeit",
    mixedRequest: "Gemischte Dioptrien und gewünschte Menge",
    mixedUnconfirmed: "nicht bestätigt",
    inquiry: "Anfragepriorität",
    inquiryPriority: (position) => `Anfragepriorität ${position}`,
    inquiryNotComparable: "nicht genug vergleichbare Preise",
    excludedFromInquiry: "nicht in der Anfragereihenfolge",
    freight: "Transport",
    duty: "Zoll",
    vat: "MwSt.",
    notEvidenced: "unbekannt — kein Nachweis",
    openDetail: "Details und Bestätigung",
    columnOrderNote: "Die Spaltenreihenfolge ist die Anfragepriorität nach dem Anzeigenpreis. Das ist keine Reihenfolge bestätigter Einkaufspreise oder Landed Costs.",
    priceNotComparable: "Die Anzeigenpreise sind keine gemeinsame Grundlage. Die Reihenfolge folgt nicht dem Preis, weil vergleichbare Nachweise fehlen.",
    missingPrice: {
      NO_PRODUCT_URL: "Das Angebot hat keine Produktadresse, daher kann der Anzeigenpreis aus der Suche nicht zugeordnet werden.",
      NO_MATCHING_SEARCH_RESULT: "Der Suchcache hat nicht dieselbe Produktadresse, daher wurde kein Anzeigenpreis übernommen.",
    },
    preliminaryAnalysis: "Vorläufige Analyse",
    confidence: "Datenzuverlässigkeit",
    mixedQuantityCaveat: (quantity) => quantity
      ? `Der Anzeigenpreis ist nicht für ${quantity} gemischte Stück bestätigt.`
      : "Der Anzeigenpreis ist nicht für die gewünschte gemischte Menge bestätigt.",
    evidence: {
      CONFIRMED_QUOTE: "Bestätigtes schriftliches Angebot",
      ADVERTISED_RANGE: "Beworbene Spanne, kein festes Angebot",
      ADVERTISED_PRICE: "Beworbener Preis, kein bestätigter Einkaufspreis",
      UNKNOWN: "Preis unbekannt",
    },
    fit: {
      NOT_APPLICABLE: "nicht gesondert geprüft",
      COMPATIBLE: "feste Dioptrie steht in der Quelle",
      NEEDS_CONFIRMATION: "Lieferantenbestätigung erforderlich",
      DISQUALIFIED: "entspricht der Anfrage nicht",
    },
  },
  en: {
    title: "Preliminary comparison",
    intro: "Only details that are already known are compared. Unknown items stay unknown. An advertised price is not a purchase price and does not unlock a profit calculation.",
    supplier: "Supplier",
    product: "Product",
    moq: "Listing MOQ",
    price: "Price",
    origin: "Origin",
    incoterm: "Incoterm",
    suitability: "Product fit",
    landedCost: "Landed cost",
    landedBlocked: "blocked until a purchase price is confirmed",
    unknown: "unknown",
    quoteRoute: "Details and confirmation open only that supplier. Nothing is sent automatically and an advertised price is not marked as confirmed.",
    leadTime: "Lead time",
    mixedRequest: "Mixed diopters and requested quantity",
    mixedUnconfirmed: "not confirmed",
    inquiry: "Inquiry priority",
    inquiryPriority: (position) => `Inquiry priority ${position}`,
    inquiryNotComparable: "not enough comparable prices",
    excludedFromInquiry: "not in the inquiry order",
    freight: "Freight",
    duty: "Duty",
    vat: "VAT",
    notEvidenced: "unknown — no evidence",
    openDetail: "Details and confirmation",
    columnOrderNote: "Column order is the inquiry priority from the advertised price. It is not an order of confirmed purchase prices or landed cost.",
    priceNotComparable: "The advertised prices are not one basis. The order is not by price because comparable evidence is missing.",
    missingPrice: {
      NO_PRODUCT_URL: "The offer has no product address, so the advertised search price cannot be connected.",
      NO_MATCHING_SEARCH_RESULT: "The search cache has no result for the same product address, so no advertised price was used.",
    },
    preliminaryAnalysis: "Preliminary analysis",
    confidence: "Data confidence",
    mixedQuantityCaveat: (quantity) => quantity
      ? `The advertised price is not confirmed for ${quantity} mixed pieces.`
      : "The advertised price is not confirmed for the requested mixed quantity.",
    evidence: {
      CONFIRMED_QUOTE: "Confirmed written quotation",
      ADVERTISED_RANGE: "Advertised range, not a firm quote",
      ADVERTISED_PRICE: "Advertised price, not a confirmed purchase price",
      UNKNOWN: "Price unknown",
    },
    fit: {
      NOT_APPLICABLE: "not separately checked",
      COMPATIBLE: "fixed diopter is stated in the source",
      NEEDS_CONFIRMATION: "needs supplier confirmation",
      DISQUALIFIED: "does not match the request",
    },
  },
};

function priceText(row: ReturnType<typeof buildPreliminaryOfferComparison>[number], text: Copy) {
  if (row.priceLow === null || !row.priceCurrency) return text.unknown;
  const low = `${row.priceLow} ${row.priceCurrency}`;
  const amount = row.priceHigh === null ? low : `${low}–${row.priceHigh} ${row.priceCurrency}`;
  return `${amount}. ${text.evidence[row.priceEvidence]}`;
}

function quantityLabel(quantity: number | null, locale: Locale) {
  if (quantity === null) return null;
  const numberLocale = locale === "sr" ? "sr-RS" : locale === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(quantity);
}

export function PreliminaryOfferComparison({
  locale,
  offers,
  requestedQuantity = null,
  detailHrefById = {},
  leadTimeById = {},
}: {
  locale: Locale;
  offers: PreliminaryComparisonInput[];
  requestedQuantity?: number | null;
  detailHrefById?: Record<string, string>;
  leadTimeById?: Record<string, string | null>;
}) {
  if (offers.length < 2) return null;
  const text = copy[locale];
  const built = buildPreliminaryOfferComparison(offers);
  const inquiry = comparisonInquiryPriority(built);
  const rows = orderPreliminaryComparisonRows(built, inquiry);
  const quantityText = quantityLabel(requestedQuantity, locale);
  const columns = Math.min(rows.length, 3);

  return (
    <section className="preliminary-comparison" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="muted-text">{text.intro}</p>
      <p className="supplier-risk-notice">{inquiry.priceUsed ? text.columnOrderNote : text.priceNotComparable}</p>
      <div className="preliminary-comparison-grid" data-columns={columns}>
        {rows.map((row) => {
          const inquiryRank = inquiry.priceUsed ? inquiry.priorityById[row.id] : undefined;
          const inquiryText = row.suitability === "DISQUALIFIED"
            ? text.excludedFromInquiry
            : inquiryRank
              ? text.inquiryPriority(inquiryRank)
              : text.inquiryNotComparable;
          const detailHref = detailHrefById[row.id];
          return (
          <article key={row.id}>
            <h4>{row.supplierName}</h4>
            <dl>
              <div>
                <dt>{text.product}</dt>
                <dd>{row.title ?? text.unknown}</dd>
              </div>
              <div>
                <dt>{text.suitability}</dt>
                <dd>{text.fit[row.suitability]}</dd>
              </div>
              <div>
                <dt>{text.moq}</dt>
                <dd>{row.listedMoq ?? text.unknown}</dd>
              </div>
              <div>
                <dt>{text.price}</dt>
                <dd>{priceText(row, text)}</dd>
              </div>
              <div>
                <dt>{text.origin}</dt>
                <dd>{row.supplierCountry ?? text.unknown}</dd>
              </div>
              <div>
                <dt>{text.leadTime}</dt>
                <dd>{leadTimeById[row.id] || text.unknown}</dd>
              </div>
              <div>
                <dt>{text.incoterm}</dt>
                <dd>{row.incoterm ?? text.unknown}</dd>
              </div>
              <div>
                <dt>{text.mixedRequest}</dt>
                <dd>{text.mixedUnconfirmed}</dd>
              </div>
              <div>
                <dt>{text.inquiry}</dt>
                <dd>{inquiryText}</dd>
              </div>
              <div>
                <dt>{text.freight}</dt>
                <dd>{text.notEvidenced}</dd>
              </div>
              <div>
                <dt>{text.duty}</dt>
                <dd>{text.notEvidenced}</dd>
              </div>
              <div>
                <dt>{text.vat}</dt>
                <dd>{text.notEvidenced}</dd>
              </div>
              <div>
                <dt>{text.landedCost}</dt>
                <dd>{text.landedBlocked}</dd>
              </div>
              {row.preliminaryDisplayedScore !== null && (
                <div>
                  <dt>{text.preliminaryAnalysis}</dt>
                  <dd>
                    {row.preliminaryDisplayedScore}/100
                    {row.priceIndicatorBonus > 0 ? ` (+${row.priceIndicatorBonus})` : ""}
                  </dd>
                </div>
              )}
              {row.confidenceScore !== null && (
                <div>
                  <dt>{text.confidence}</dt>
                  <dd>{row.confidenceScore}%</dd>
                </div>
              )}
            </dl>
            {(row.priceEvidence === "ADVERTISED_PRICE" || row.priceEvidence === "ADVERTISED_RANGE") && (
              <p className="muted-text">{text.mixedQuantityCaveat(quantityText)}</p>
            )}
            {row.missingAdvertisedPriceReason && (
              <p className="muted-text">{text.missingPrice[row.missingAdvertisedPriceReason]}</p>
            )}
            {row.productUrl && (
              <p><a href={row.productUrl} rel="noreferrer" target="_blank">{row.supplierName}</a></p>
            )}
            {detailHref && (
              <p>
                <Link
                  className="secondary-button preliminary-comparison-action"
                  href={detailHref}
                  aria-label={`${text.openDetail}: ${row.supplierName}`}
                >
                  {text.openDetail}
                </Link>
              </p>
            )}
          </article>
          );
        })}
      </div>
      <p className="warning-text">{text.quoteRoute}</p>
    </section>
  );
}
