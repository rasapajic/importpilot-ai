import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
  "utf8",
);
const formSource = readFileSync(
  join(process.cwd(), "components/offers/commercial-terms-form.tsx"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/offers/[offerId]/commercial-terms/route.ts"),
  "utf8",
);
const validationSource = readFileSync(
  join(process.cwd(), "modules/offers/domain/offer-validation.ts"),
  "utf8",
);
const serviceSource = readFileSync(
  join(process.cwd(), "modules/offers/application/offer-service.ts"),
  "utf8",
);

describe("focused ImportPilot 1.0 offer detail", () => {
  it("shows only the selected offer when one is focused", () => {
    expect(panelSource).toContain("focusedOfferId?: string");
    expect(panelSource).toContain("const focusedOffer = focusedOfferId");
    expect(panelSource).toContain("const offersForInput = focusedOffer ? [focusedOffer] : offers");
    expect(panelSource).toContain("Izabrana ponuda");
    expect(panelSource).toContain("Otvori izvornu ponudu");
  });

  it("does not let an older project decision mask a newly focused offer", () => {
    expect(panelSource).toContain("const projectHasFinalDecision = isFinalDecisionStatus(decision?.status)");
    expect(panelSource).toContain("!focusedOffer || decision?.selectedOfferId === focusedOffer.id");
    expect(panelSource).toContain("const bestOffer = focusedOffer ?? decisionOffer ?? calculatedOffers[0] ?? null");
    expect(panelSource).toContain("const canCheckProfitability = focusedOffer");
  });

  it("asks only for the commercial terms required to unlock calculation", () => {
    expect(panelSource).toContain("<CommercialTermsForm");
    expect(formSource).toContain('name="unitPrice"');
    expect(formSource).toContain('name="currency"');
    expect(formSource).toContain('name="incoterm"');
    expect(formSource).toContain("Potvrdite podatke ponude");
    expect(formSource).not.toContain("supplierVerified");
    expect(formSource).not.toContain("paymentTerms");
  });

  it("uses a dedicated tenant-scoped commercial terms endpoint", () => {
    expect(routeSource).toContain("commercialTermsSchema.safeParse");
    expect(routeSource).toContain("updateOfferCommercialTerms");
    expect(serviceSource).toContain("tenantOfferFilter(offerId, organizationId)");
    expect(serviceSource).toContain("unitPrice: input.unitPrice");
    expect(serviceSource).toContain("currency: input.currency");
    expect(serviceSource).toContain("incoterm: input.incoterm");
  });

  it("requires a complete price/currency/incoterm set before calculation", () => {
    expect(validationSource).toContain("export const commercialTermsSchema");
    expect(validationSource).toContain("unitPrice: z.coerce.number().positive().finite()");
    expect(validationSource).toContain("regex(/^[A-Z]{3}$/)");
    expect(validationSource).toContain("incoterm: z.string().trim().toUpperCase().min(2).max(20)");
  });
});