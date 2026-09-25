import { describe, expect, it } from "vitest";

import { buildLandedCostBreakdown } from "../../modules/cost-engine/application/landed-cost-breakdown";
import { calculateLandedCost } from "../../modules/cost-engine/domain/calculator";
import {
  canShowBestChoice,
  classifyOffer,
  findMatchingQuantityTier,
  selectBestChoiceId,
  type QuantityTier,
} from "../../modules/product-search/domain/offer-classification";
import { generateRfqMessage } from "../../modules/product-search/domain/rfq";
import { translateText } from "../../modules/i18n/translations";

describe("JAKOV360 acceptance import flow fixes", () => {
  it("explains the glasses landed-cost gap and keeps displayed details mathematically consistent", () => {
    const result = calculateLandedCost({
      targetCountry: "RS",
      quantity: 1000,
      unitPrice: "0.9640",
      currency: "EUR",
      incoterm: "FOB",
      shippingCost: "830.00",
      customsDutyRate: "0",
      vatRate: "20",
      storageCost: "0",
      inspectionCost: "0",
      otherCosts: "0",
      targetSellingPrice: "4.00",
    });
    expect(result.landedCostPerUnit).toBe("2.15");

    const breakdown = buildLandedCostBreakdown({
      ...result,
      calculationStatus: "NEEDS_REVIEW",
      customsProvenance: {
        sourceName: "Uprava carina Republike Srbije — TARIS",
        officialUrl: "https://www.carina.rs/",
        checkedAt: "2026-06-15",
        tariffCode: "9004",
        originCountry: "CN",
        shippingCountry: "CN",
        rateType: "standard",
        confirmedByOfficialSource: false,
        classificationSuggested: true,
      },
      shippingEstimated: true,
    });

    expect(breakdown.goodsCost).toBe(964);
    expect(breakdown.customsDutyAmount).toBe(0);
    expect(breakdown.vatBase).toBe(1794);
    expect(breakdown.vatAmount).toBe(358.8);
    expect(breakdown.displayedTotal).toBe(2152.8);
    expect(breakdown.mathematicallyConsistent).toBe(true);
    expect(breakdown.isConfirmed).toBe(false);
    expect(breakdown.pendingReasons).toContain("Carinska stopa nije potvrđena zvaničnim izvorom.");
  });

  it("handles known transport, unknown transport, 0% duty and preferential provenance without double counting", () => {
    const known = calculateLandedCost({
      targetCountry: "DE",
      quantity: 10,
      unitPrice: "10",
      currency: "EUR",
      incoterm: "CIF",
      shippingCost: "20",
      customsDutyRate: "0",
      vatRate: "19",
      storageCost: "0",
      inspectionCost: "0",
      otherCosts: "0",
      targetSellingPrice: "20",
    });
    expect(known.customsDutyAmount).toBe("0.00");
    expect(known.vatAmount).toBe("22.80");
    expect(known.landedCostTotal).toBe("142.80");

    const confirmed = buildLandedCostBreakdown({
      ...known,
      customsProvenance: {
        sourceName: "European Commission — TARIC",
        officialUrl: "https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en",
        checkedAt: "2026-06-15",
        validFrom: "2026",
        tariffCode: "85044095",
        originCountry: "CN",
        shippingCountry: "CN",
        rateType: "preferential",
        confirmedByOfficialSource: true,
      },
      insuranceCost: "0",
      freightForwardingCost: "0",
      costEvidence: {
        goods: { status: "CONFIRMED", value: "10" },
        shipping: { status: "CONFIRMED", value: "20" },
        insurance: { status: "NOT_APPLICABLE", value: null },
        customsDutyRate: { status: "CONFIRMED", value: "0" },
        vatRate: { status: "CONFIRMED", value: "19" },
        freightForwarding: { status: "NOT_APPLICABLE", value: null },
        storage: { status: "NOT_APPLICABLE", value: null },
        inspection: { status: "NOT_APPLICABLE", value: null },
        other: { status: "NOT_APPLICABLE", value: null },
        vatTreatment: "COST",
      },
    });
    expect(confirmed.isConfirmed).toBe(true);

    const unknownTransport = buildLandedCostBreakdown({
      ...known,
      shippingCost: "0",
      customsProvenance: { confirmedByOfficialSource: true },
    });
    expect(unknownTransport.pendingReasons).toContain("Transport nije potvrđen.");
  });

  it("marks the matching quantity tier and does not invent unknown quantity prices", () => {
    const tiers: QuantityTier[] = [
      { minQuantity: 12, maxQuantity: 499, price: 1.3, currency: "USD", confirmed: true },
      { minQuantity: 500, maxQuantity: 1199, price: 1.1, currency: "USD", confirmed: true },
      { minQuantity: 1200, maxQuantity: 4999, price: 0.9, currency: "USD", confirmed: true },
      { minQuantity: 5000, maxQuantity: null, price: null, currency: null, confirmed: false },
    ];
    expect(findMatchingQuantityTier(tiers, 1000)).toEqual(tiers[1]);
    expect(tiers[3].price).toBeNull();
  });

  it("classifies Dudi Co. as domestic and blocks unconfirmed retail price from best-choice ranking", () => {
    const classification = classifyOffer({
      source: "Dudi Co.",
      targetCountry: "RS",
      sellerCountry: "RS",
      originCountry: "CN",
      importerName: "Dudi Co.",
      currency: "RSD",
      priceIncludesVat: true,
      availabilityConfirmed: false,
      b2bPriceConfirmed: false,
    });
    expect(classification.kind).toBe("DOMESTIC");
    expect(classification.directImportCostsForBuyer).toBe(false);
    expect(classification.needsSupplierConfirmation).toBe(true);
    expect(canShowBestChoice({
      classification,
      hasComparablePrice: true,
      hasConfirmedAvailability: false,
    })).toBe(false);
  });

  it("validates direct import, unknown offer type and product URL/RFQ behavior", () => {
    expect(classifyOffer({
      source: "Made-in-China",
      supplierCountry: "CN",
      targetCountry: "RS",
      availabilityConfirmed: true,
    }).kind).toBe("DIRECT_IMPORT");
    expect(classifyOffer({ source: "unknown", targetCountry: "RS" }).kind).toBe("UNKNOWN");

    const productUrl = "https://supplier.example/product/charger-1.html";
    expect(new URL(productUrl).pathname).not.toBe("/");
    expect(new URL("https://supplier.example").pathname).toBe("/");

    const sample = generateRfqMessage({
      productTitle: "USB-C charger",
      supplierName: "Supplier Ltd.",
      quantity: 100,
      deliveryCountry: "RS",
      orderType: "SAMPLE",
      productUrl,
      deliveryCity: "Beograd",
      postalCode: "11000",
    });
    expect(sample).toContain("request a sample");
    expect(sample).toContain("sample shipping cost");
    expect(sample).not.toContain("carton dimensions, gross weight and net weight");
    expect(sample).not.toContain("100 units");

    const fullOrder = generateRfqMessage({
      productTitle: "USB-C charger",
      supplierName: "Nepotvrđen prodavac",
      quantity: 100,
      deliveryCountry: "RS",
      orderType: "FULL_ORDER",
      deliveryCity: "Beograd",
      postalCode: "11000",
    });
    expect(fullOrder).toContain("Hello Sales Team,");
    expect(fullOrder).toContain("final quotation for 100 units");
    expect(fullOrder).toContain("final unit price and total price");
    expect(fullOrder).toContain("carton dimensions, gross weight and net weight");
    expect(fullOrder).toContain("11000 Beograd RS");
  });

  it("selects at most one best choice from a genuinely comparable cohort", () => {
    const direct = classifyOffer({
      offerType: "DIRECT_IMPORT",
      availabilityConfirmed: true,
      b2bPriceConfirmed: true,
    });
    const winner = selectBestChoiceId([
      { id: "first", classification: direct, supplierName: "First", price: 1.2, currency: "USD", minimumOrderQuantity: 100, incoterm: "FOB", availabilityConfirmed: true },
      { id: "second", classification: direct, supplierName: "Second", price: 1.1, currency: "USD", minimumOrderQuantity: 100, incoterm: "FOB", availabilityConfirmed: true },
      { id: "third", classification: direct, supplierName: "Third", price: 1.3, currency: "USD", minimumOrderQuantity: 100, incoterm: "FOB", availabilityConfirmed: true },
    ], 1000);

    expect(winner).toBe("second");
  });

  it("does not rank incomplete, unconfirmed or non-normalized offer groups", () => {
    const direct = classifyOffer({ offerType: "DIRECT_IMPORT", availabilityConfirmed: true, b2bPriceConfirmed: true });
    const domestic = classifyOffer({ offerType: "DOMESTIC", availabilityConfirmed: true, b2bPriceConfirmed: true });
    const unconfirmedDomestic = classifyOffer({ offerType: "DOMESTIC", availabilityConfirmed: false, b2bPriceConfirmed: false });

    expect(selectBestChoiceId([
      { id: "import", classification: direct, supplierName: "Importer", price: 10, currency: "EUR", minimumOrderQuantity: 100, incoterm: "DDP", availabilityConfirmed: true },
      { id: "domestic", classification: domestic, supplierName: "Local", price: 12, currency: "EUR", minimumOrderQuantity: 100, incoterm: "DDP", availabilityConfirmed: true },
    ], 100)).toBeNull();
    expect(selectBestChoiceId([
      { id: "retail", classification: unconfirmedDomestic, supplierName: "Dudi Co.", price: 1099, currency: "RSD", minimumOrderQuantity: 100, incoterm: "DDP", availabilityConfirmed: false },
      { id: "missing-moq", classification: direct, supplierName: "Incomplete", price: 5, currency: "USD", minimumOrderQuantity: null, incoterm: "FOB", availabilityConfirmed: true },
    ], 100)).toBeNull();
  });

  it("keeps new Serbian localization strings available", () => {
    expect(translateText("Domestic offers", "sr")).toBe("Domaće ponude");
    expect(translateText("Waiting for confirmed data", "sr")).toBe("Čeka potvrđene podatke");
    expect(translateText("Request final quote", "sr")).toBe("Zatraži konačnu ponudu");
    expect(translateText("When you receive the reply, enter the confirmed data by editing the offer and calculation.", "sr"))
      .toBe("Kada dobijete odgovor, unesite potvrđene podatke kroz izmenu ponude i kalkulacije.");
    expect(translateText("Image was not fetched", "sr")).toBe("Slika nije preuzeta");
  });
});
