import { describe, expect, it } from "vitest";

import { buildLandedCostBreakdown } from "../../modules/cost-engine/application/landed-cost-breakdown";
import { calculateLandedCost } from "../../modules/cost-engine/domain/calculator";
import {
  canShowBestChoice,
  classifyOffer,
  findMatchingQuantityTier,
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
        tariffCode: "8504",
        originCountry: "CN",
        shippingCountry: "CN",
        rateType: "preferential",
        confirmedByOfficialSource: true,
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
    });
    expect(sample).toContain("request a sample");
    expect(sample).toContain("carton dimensions, gross weight and net weight");

    const fullOrder = generateRfqMessage({
      productTitle: "USB-C charger",
      supplierName: "Supplier Ltd.",
      quantity: 100,
      deliveryCountry: "RS",
      orderType: "FULL_ORDER",
    });
    expect(fullOrder).toContain("final quotation for 100 units");
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
