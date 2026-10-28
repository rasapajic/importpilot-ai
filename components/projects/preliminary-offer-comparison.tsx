import type { Locale } from "@/modules/i18n/translations";
import type { ExplicitProductConstraintStatus } from "@/modules/product-search/domain/explicit-product-constraints";
import {
  buildPreliminaryOfferComparison,
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
    quoteRoute: "Potvrdu zatražite u koraku sa ponudama. Poruka se ne šalje sama i cena se ne označava kao poslata.",
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
    quoteRoute: "Bitten Sie im Angebotsschritt um Bestätigung. Es wird nichts automatisch gesendet und kein Preis als gesendet markiert.",
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
    quoteRoute: "Request confirmation from the offer step. Nothing is sent automatically and no price is marked as sent.",
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

export function PreliminaryOfferComparison({
  locale,
  offers,
}: {
  locale: Locale;
  offers: PreliminaryComparisonInput[];
}) {
  if (offers.length < 2) return null;
  const text = copy[locale];
  const rows = buildPreliminaryOfferComparison(offers);

  return (
    <section className="preliminary-comparison" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="muted-text">{text.intro}</p>
      <div className="preliminary-comparison-grid">
        {rows.map((row) => (
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
                <dt>{text.incoterm}</dt>
                <dd>{row.incoterm ?? text.unknown}</dd>
              </div>
              <div>
                <dt>{text.landedCost}</dt>
                <dd>{text.landedBlocked}</dd>
              </div>
            </dl>
            {row.productUrl && (
              <p><a href={row.productUrl} rel="noreferrer" target="_blank">{row.supplierName}</a></p>
            )}
          </article>
        ))}
      </div>
      <p className="warning-text">{text.quoteRoute}</p>
    </section>
  );
}
