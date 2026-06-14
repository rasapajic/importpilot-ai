import { OfferExtractionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  deletableManualOfferFilter,
  tenantOfferFilter,
} from "../../modules/offers/domain/offer-access";

describe("supplier offer CRUD access filters", () => {
  it("always scopes offer access by both id and organization", () => {
    expect(tenantOfferFilter("offer-a", "tenant-a")).toEqual({
      id: "offer-a",
      organizationId: "tenant-a",
    });
    expect(tenantOfferFilter("offer-a", "tenant-b")).not.toEqual(
      tenantOfferFilter("offer-a", "tenant-a"),
    );
  });

  it("allows deletion only for manual offers in the active tenant", () => {
    expect(deletableManualOfferFilter("offer-a", "tenant-a")).toEqual({
      id: "offer-a",
      organizationId: "tenant-a",
      extractionStatus: OfferExtractionStatus.MANUAL,
    });
  });
});
