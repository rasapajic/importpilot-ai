"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type {
  SupplierOfferProductAttribute,
  SupplierOfferUrlPreview,
} from "@/modules/product-search/domain/search";

function tierQuantity(minQuantity: number, maxQuantity: number | null) {
  return maxQuantity === null
    ? `${minQuantity.toLocaleString()}+`
    : `${minQuantity.toLocaleString()}–${maxQuantity.toLocaleString()}`;
}

function AttributeSection({
  title,
  attributes,
}: {
  title: string;
  attributes: SupplierOfferProductAttribute[];
}) {
  if (attributes.length === 0) return null;
  return (
    <section>
      <h4>{title}</h4>
      <dl className="marketplace-attribute-list">
        {attributes.map((attribute) => (
          <div key={`${attribute.name}-${attribute.value}`}>
            <dt>{attribute.name}</dt>
            <dd>{attribute.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function MarketplaceProductEvidence({
  preview,
}: {
  preview: SupplierOfferUrlPreview;
}) {
  const { t } = useI18n();
  const details = preview.details;
  if (!details) return null;

  const productSpecifications = details.attributes.filter(
    (attribute) => attribute.category === "PRODUCT_SPECIFICATION",
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
        packaging.sellingUnit
          ? `${t("Prodajna jedinica")}: ${packaging.sellingUnit}`
          : null,
        packaging.packageType
          ? `${t("Vrsta pakovanja")}: ${packaging.packageType}`
          : null,
        packaging.packageLengthCm !== null &&
        packaging.packageWidthCm !== null &&
        packaging.packageHeightCm !== null
          ? `${t("Dimenzije pakovanja")}: ${packaging.packageLengthCm} × ${packaging.packageWidthCm} × ${packaging.packageHeightCm} cm`
          : null,
        packaging.grossWeightKg !== null
          ? `${t("Bruto težina")}: ${packaging.grossWeightKg} kg`
          : null,
        packaging.piecesPerCarton !== null
          ? `${t("Komada u kartonu")}: ${packaging.piecesPerCarton}`
          : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const hasVisibleEvidence =
    details.priceTiers.length > 0 ||
    details.variants.length > 0 ||
    details.attributes.length > 0 ||
    packagingValues.length > 0;

  if (!hasVisibleEvidence) return null;

  return (
    <details className="marketplace-evidence" open>
      <summary>
        {t("Podaci potvrđeni sa stranice proizvoda")}
        {productSpecifications.length > 0
          ? ` · ${productSpecifications.length} ${t("specifikacija proizvoda")}`
          : ""}
        {details.variants.length > 0
          ? ` · ${details.variants.length} ${t("grupa varijanti")}`
          : ""}
      </summary>

      <p className="muted-text marketplace-evidence-source">
        {t("Izvor dokaza")}: {details.evidence === "PRODUCT_PAGE"
          ? t("stranica proizvoda")
          : t("rezultat pretrage")}
        {` · ${details.adapter}`}
      </p>

      {details.priceTiers.length > 0 && (
        <section>
          <h4>{t("Količinske cene")}</h4>
          <ul className="marketplace-evidence-list">
            {details.priceTiers.map((tier) => (
              <li
                key={`${tier.currency ?? "currency"}-${tier.minQuantity}-${tier.maxQuantity ?? "open"}`}
              >
                <strong>{tier.price} {tier.currency ?? preview.currency ?? ""}</strong>
                {` · ${tierQuantity(tier.minQuantity, tier.maxQuantity)} ${t("komada")}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.variants.length > 0 && (
        <section>
          <h4>{t("Varijante proizvoda")}</h4>
          <ul className="marketplace-evidence-list">
            {details.variants.map((variant) => (
              <li key={variant.name}>
                <strong>{variant.name}:</strong> {variant.values.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AttributeSection
        attributes={productSpecifications}
        title={t("Specifikacije proizvoda")}
      />
      <AttributeSection
        attributes={supplierCommercial}
        title={t("Dobavljač i komercijalni uslovi")}
      />
      <AttributeSection
        attributes={marketplaceServices}
        title={t("Usluge i zaštita marketplace-a")}
      />
      <AttributeSection
        attributes={otherSourceData}
        title={t("Ostali podaci sa izvora")}
      />

      {packagingValues.length > 0 && packaging && (
        <section>
          <h4>{t("Pakovanje i logistika")}</h4>
          <ul className="marketplace-evidence-list">
            {packagingValues.map((value) => <li key={value}>{value}</li>)}
          </ul>
          {packaging.usableForLandedCost ? (
            <p className="marketplace-logistics-status marketplace-logistics-status-usable">
              ✓ {t("Podaci o pakovanju mogu se koristiti u obračunu landed cost-a.")}
              {` ${t("Pouzdanost")}: ${packaging.confidence}.`}
            </p>
          ) : (
            <p className="marketplace-logistics-status marketplace-logistics-status-review">
              {t("Podaci o pakovanju nisu uključeni u landed cost dok se ne potvrdi jedinica pakovanja.")}
              {packaging.validationNote ? ` ${packaging.validationNote}` : ""}
            </p>
          )}
        </section>
      )}
    </details>
  );
}
