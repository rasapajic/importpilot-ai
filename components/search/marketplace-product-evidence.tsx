"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import type {
  SupplierOfferProductAttribute,
  SupplierOfferUrlPreview,
} from "@/modules/product-search/domain/search";

type EvidenceCopy = {
  showDetails: string;
  specificationCount: string;
  variantGroupCount: string;
  evidenceSource: string;
  madeInChinaProductPage: string;
  productPage: string;
  searchResult: string;
  quantityPrices: string;
  units: string;
  productVariants: string;
  productSpecifications: string;
  supplierCommercial: string;
  marketplaceServices: string;
  otherSourceData: string;
  packagingLogistics: string;
  sellingUnit: string;
  packageType: string;
  packageDimensions: string;
  grossWeight: string;
  piecesPerCarton: string;
  usableForLandedCost: string;
  notUsableForLandedCost: string;
  confidence: string;
  confidenceHigh: string;
  confidenceMedium: string;
  confidenceLow: string;
  incompletePackaging: string;
  implausiblePackaging: string;
  unconfirmedPackagingScope: string;
  packagingRequiresReview: string;
};

const copyByLocale: Record<Locale, EvidenceCopy> = {
  sr: {
    showDetails: "Prikaži detaljne podatke sa stranice proizvoda",
    specificationCount: "specifikacija",
    variantGroupCount: "grupe varijanti",
    evidenceSource: "Izvor dokaza",
    madeInChinaProductPage: "Made-in-China stranica proizvoda",
    productPage: "stranica proizvoda",
    searchResult: "rezultat pretrage",
    quantityPrices: "Količinske cene",
    units: "komada",
    productVariants: "Varijante proizvoda",
    productSpecifications: "Specifikacije proizvoda",
    supplierCommercial: "Dobavljač i komercijalni uslovi",
    marketplaceServices: "Usluge i zaštita marketplace-a",
    otherSourceData: "Ostali podaci sa izvora",
    packagingLogistics: "Pakovanje i logistika",
    sellingUnit: "Prodajna jedinica",
    packageType: "Vrsta pakovanja",
    packageDimensions: "Dimenzije pakovanja",
    grossWeight: "Bruto težina",
    piecesPerCarton: "Komada u kartonu",
    usableForLandedCost: "Podaci o pakovanju mogu se koristiti u preliminarnom obračunu ukupne nabavne cene.",
    notUsableForLandedCost: "Podaci o pakovanju nisu uključeni u obračun transporta dok se ne potvrde kod dobavljača.",
    confidence: "Pouzdanost",
    confidenceHigh: "visoka",
    confidenceMedium: "srednja",
    confidenceLow: "niska",
    incompletePackaging: "Nedostaju potpune dimenzije ili bruto težina pakovanja.",
    implausiblePackaging: "Dimenzije i težina paketa deluju nelogično.",
    unconfirmedPackagingScope: "Nije potvrđeno da li se podaci odnose na prodajnu jedinicu ili karton.",
    packagingRequiresReview: "Podaci o pakovanju zahtevaju dodatnu proveru.",
  },
  de: {
    showDetails: "Detaillierte Daten der Produktseite anzeigen",
    specificationCount: "Spezifikationen",
    variantGroupCount: "Variantengruppen",
    evidenceSource: "Nachweisquelle",
    madeInChinaProductPage: "Made-in-China-Produktseite",
    productPage: "Produktseite",
    searchResult: "Suchergebnis",
    quantityPrices: "Mengenpreise",
    units: "Stück",
    productVariants: "Produktvarianten",
    productSpecifications: "Produktspezifikationen",
    supplierCommercial: "Lieferant und Handelsbedingungen",
    marketplaceServices: "Marktplatzdienste und Käuferschutz",
    otherSourceData: "Weitere Quelldaten",
    packagingLogistics: "Verpackung und Logistik",
    sellingUnit: "Verkaufseinheit",
    packageType: "Verpackungsart",
    packageDimensions: "Verpackungsmaße",
    grossWeight: "Bruttogewicht",
    piecesPerCarton: "Stück pro Karton",
    usableForLandedCost: "Die Verpackungsdaten können für eine vorläufige Einstandskostenberechnung verwendet werden.",
    notUsableForLandedCost: "Die Verpackungsdaten werden erst nach Bestätigung durch den Lieferanten für den Transport verwendet.",
    confidence: "Zuverlässigkeit",
    confidenceHigh: "hoch",
    confidenceMedium: "mittel",
    confidenceLow: "niedrig",
    incompletePackaging: "Vollständige Verpackungsmaße oder das Bruttogewicht fehlen.",
    implausiblePackaging: "Verpackungsmaße und Gewicht wirken unplausibel.",
    unconfirmedPackagingScope: "Es ist nicht bestätigt, ob sich die Daten auf eine Verkaufseinheit oder einen Karton beziehen.",
    packagingRequiresReview: "Die Verpackungsdaten müssen zusätzlich geprüft werden.",
  },
  en: {
    showDetails: "Show detailed product-page data",
    specificationCount: "specifications",
    variantGroupCount: "variant groups",
    evidenceSource: "Evidence source",
    madeInChinaProductPage: "Made-in-China product page",
    productPage: "product page",
    searchResult: "search result",
    quantityPrices: "Quantity prices",
    units: "units",
    productVariants: "Product variants",
    productSpecifications: "Product specifications",
    supplierCommercial: "Supplier and commercial terms",
    marketplaceServices: "Marketplace services and buyer protection",
    otherSourceData: "Other source data",
    packagingLogistics: "Packaging and logistics",
    sellingUnit: "Selling unit",
    packageType: "Package type",
    packageDimensions: "Package dimensions",
    grossWeight: "Gross weight",
    piecesPerCarton: "Pieces per carton",
    usableForLandedCost: "The packaging data can be used in a preliminary landed-cost calculation.",
    notUsableForLandedCost: "The packaging data is excluded from transport calculations until the supplier confirms it.",
    confidence: "Confidence",
    confidenceHigh: "high",
    confidenceMedium: "medium",
    confidenceLow: "low",
    incompletePackaging: "Complete package dimensions or gross weight are missing.",
    implausiblePackaging: "The package dimensions and weight appear implausible.",
    unconfirmedPackagingScope: "It is not confirmed whether the data refers to one selling unit or a carton.",
    packagingRequiresReview: "The packaging data requires additional review.",
  },
};

const attributeLabels: Record<Locale, Record<string, string>> = {
  sr: {
    "product name": "Naziv proizvoda",
    certification: "Sertifikacija",
    keywords: "Ključne reči",
    customization: "Prilagođavanje",
    "payment terms": "Uslovi plaćanja",
    "main markets": "Glavna tržišta",
    "production capacity": "Kapacitet proizvodnje",
    application: "Namena",
    voltage: "Napon",
    flow: "Protok / otvor mlaznice",
    material: "Materijal",
    pump: "Pumpa",
    nozzle: "Mlaznice",
    "model no": "Model",
    "power source": "Izvor napajanja",
  },
  de: {
    "product name": "Produktname",
    certification: "Zertifizierung",
    keywords: "Schlüsselwörter",
    customization: "Anpassung",
    "payment terms": "Zahlungsbedingungen",
    "main markets": "Hauptmärkte",
    "production capacity": "Produktionskapazität",
    application: "Anwendung",
    voltage: "Spannung",
    flow: "Durchfluss / Düsenöffnung",
    material: "Material",
    pump: "Pumpe",
    nozzle: "Düsen",
    "model no": "Modell",
    "power source": "Stromquelle",
  },
  en: {
    "product name": "Product name",
    certification: "Certification",
    keywords: "Keywords",
    customization: "Customization",
    "payment terms": "Payment terms",
    "main markets": "Main markets",
    "production capacity": "Production capacity",
    application: "Application",
    voltage: "Voltage",
    flow: "Flow / nozzle opening",
    material: "Material",
    pump: "Pump",
    nozzle: "Nozzles",
    "model no": "Model",
    "power source": "Power source",
  },
};

function normalizedLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function localizedAttributeName(name: string, locale: Locale) {
  return attributeLabels[locale][normalizedLabel(name)] ?? name;
}

function tierQuantity(
  minQuantity: number,
  maxQuantity: number | null,
  locale: Locale,
) {
  const numberLocale = locale === "sr" ? "sr-Latn" : locale;
  return maxQuantity === null
    ? `${minQuantity.toLocaleString(numberLocale)}+`
    : `${minQuantity.toLocaleString(numberLocale)}–${maxQuantity.toLocaleString(numberLocale)}`;
}

function visibleAttribute(attribute: SupplierOfferProductAttribute) {
  const value = attribute.value.replace(/\s+/g, " ").trim();
  return value.length > 0 &&
    !/^\[?(?:email|null)\s+protected\]?$/i.test(value) &&
    !/^email\s+protected$/i.test(value);
}

function AttributeSection({
  title,
  attributes,
  locale,
}: {
  title: string;
  attributes: SupplierOfferProductAttribute[];
  locale: Locale;
}) {
  const visibleAttributes = attributes.filter(visibleAttribute);
  if (visibleAttributes.length === 0) return null;
  return (
    <section>
      <h4>{title}</h4>
      <dl className="marketplace-attribute-list">
        {visibleAttributes.map((attribute) => (
          <div key={`${attribute.name}-${attribute.value}`}>
            <dt>{localizedAttributeName(attribute.name, locale)}</dt>
            <dd>{attribute.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function evidenceSourceLabel(adapter: string, evidence: string, copy: EvidenceCopy) {
  if (adapter.startsWith("made-in-china")) return copy.madeInChinaProductPage;
  return evidence === "PRODUCT_PAGE" ? copy.productPage : copy.searchResult;
}

function confidenceLabel(
  confidence: "HIGH" | "MEDIUM" | "LOW",
  copy: EvidenceCopy,
) {
  if (confidence === "HIGH") return copy.confidenceHigh;
  if (confidence === "MEDIUM") return copy.confidenceMedium;
  return copy.confidenceLow;
}

function packagingValidationMessage(note: string | null, copy: EvidenceCopy) {
  if (note === "Package dimensions and gross weight are incomplete.") {
    return copy.incompletePackaging;
  }
  if (note === "Package dimensions and weight produce an implausible packaged density.") {
    return copy.implausiblePackaging;
  }
  if (note === "Package dimensions and weight are not tied to a confirmed selling unit or carton.") {
    return copy.unconfirmedPackagingScope;
  }
  return note ? copy.packagingRequiresReview : "";
}

export function MarketplaceProductEvidence({
  preview,
}: {
  preview: SupplierOfferUrlPreview;
}) {
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const details = preview.details;
  if (!details) return null;

  const variantNames = new Set(
    details.variants.map((variant) => normalizedLabel(variant.name)),
  );
  const productSpecifications = details.attributes.filter(
    (attribute) =>
      attribute.category === "PRODUCT_SPECIFICATION" &&
      !variantNames.has(normalizedLabel(attribute.name)) &&
      visibleAttribute(attribute),
  );
  const supplierCommercial = details.attributes.filter(
    (attribute) => attribute.category === "SUPPLIER_COMMERCIAL",
  );
  const marketplaceServices = details.attributes.filter(
    (attribute) => attribute.category === "MARKETPLACE_SERVICE",
  );
  const otherSourceData = details.attributes.filter(
    (attribute) => attribute.category === "OTHER",
  );

  const packaging = details.packaging;
  const packagingValues = packaging
    ? [
        packaging.sellingUnit ? `${copy.sellingUnit}: ${packaging.sellingUnit}` : null,
        packaging.packageType ? `${copy.packageType}: ${packaging.packageType}` : null,
        packaging.packageLengthCm !== null &&
        packaging.packageWidthCm !== null &&
        packaging.packageHeightCm !== null
          ? `${copy.packageDimensions}: ${packaging.packageLengthCm} × ${packaging.packageWidthCm} × ${packaging.packageHeightCm} cm`
          : null,
        packaging.grossWeightKg !== null
          ? `${copy.grossWeight}: ${packaging.grossWeightKg} kg`
          : null,
        packaging.piecesPerCarton !== null
          ? `${copy.piecesPerCarton}: ${packaging.piecesPerCarton}`
          : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const hasVisibleEvidence =
    details.priceTiers.length > 0 ||
    details.variants.length > 0 ||
    details.attributes.some(visibleAttribute) ||
    packagingValues.length > 0;
  if (!hasVisibleEvidence) return null;

  return (
    <details className="marketplace-evidence">
      <summary>
        {copy.showDetails}
        {productSpecifications.length > 0
          ? ` · ${productSpecifications.length} ${copy.specificationCount}`
          : ""}
        {details.variants.length > 0
          ? ` · ${details.variants.length} ${copy.variantGroupCount}`
          : ""}
      </summary>

      <p className="muted-text marketplace-evidence-source">
        {copy.evidenceSource}: {evidenceSourceLabel(
          details.adapter,
          details.evidence,
          copy,
        )}
      </p>

      {details.priceTiers.length > 0 && (
        <section>
          <h4>{copy.quantityPrices}</h4>
          <ul className="marketplace-evidence-list">
            {details.priceTiers.map((tier) => (
              <li
                key={`${tier.currency ?? "currency"}-${tier.minQuantity}-${tier.maxQuantity ?? "open"}`}
              >
                <strong>{tier.price} {tier.currency ?? preview.currency ?? ""}</strong>
                {` · ${tierQuantity(tier.minQuantity, tier.maxQuantity, locale)} ${copy.units}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.variants.length > 0 && (
        <section>
          <h4>{copy.productVariants}</h4>
          <ul className="marketplace-evidence-list">
            {details.variants.map((variant) => (
              <li key={variant.name}>
                <strong>{localizedAttributeName(variant.name, locale)}:</strong>{" "}
                {variant.values.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AttributeSection
        attributes={productSpecifications}
        locale={locale}
        title={copy.productSpecifications}
      />
      <AttributeSection
        attributes={supplierCommercial}
        locale={locale}
        title={copy.supplierCommercial}
      />
      <AttributeSection
        attributes={marketplaceServices}
        locale={locale}
        title={copy.marketplaceServices}
      />
      <AttributeSection
        attributes={otherSourceData}
        locale={locale}
        title={copy.otherSourceData}
      />

      {packagingValues.length > 0 && packaging && (
        <section>
          <h4>{copy.packagingLogistics}</h4>
          <ul className="marketplace-evidence-list">
            {packagingValues.map((value) => <li key={value}>{value}</li>)}
          </ul>
          {packaging.usableForLandedCost ? (
            <p className="marketplace-logistics-status marketplace-logistics-status-usable">
              ✓ {copy.usableForLandedCost}{" "}
              {copy.confidence}: {confidenceLabel(packaging.confidence, copy)}.
            </p>
          ) : (
            <p className="marketplace-logistics-status marketplace-logistics-status-review">
              {copy.notUsableForLandedCost}{" "}
              {packagingValidationMessage(packaging.validationNote, copy)}
            </p>
          )}
        </section>
      )}
    </details>
  );
}
