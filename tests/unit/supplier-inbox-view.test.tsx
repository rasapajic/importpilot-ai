import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { SupplierInboxView } from "@/components/projects/supplier-inbox-view";
import type { ProjectInboxDto } from "@/modules/supplier-inbox/domain/types";

const model: ProjectInboxDto = {
  projectId: "project-1",
  receivingEnabled: false,
  threads: [
    {
      id: "thread-1",
      supplierName: "Wenzhou Youge Eyewear",
      status: "NEEDS_CLARIFICATION",
      orderedQuantity: 1000,
      ingestionDelayed: false,
      unverifiedSenderAcknowledged: false,
      confirmAllowed: false,
      confirmBlockedReason: "Conflicting fields need clarification.",
      appliedToCostEngine: false,
      commercialOrderPlaced: false,
      extractorModelId: "fixture-quote-extractor-v1",
      messages: [
        {
          id: "message-1",
          fromAddress: "sales@wenzhou-glasses.example.test",
          subject: "Quote",
          receivedAt: "2026-10-28T12:00:00.000Z",
          senderTrust: "UNVERIFIED",
          source: "SYNTHETIC",
          originalText: "Unit price USD 1.20 for 1000 pcs.",
          serbianText: "Jedinična cena 1,20 USD za 1.000 komada.",
          translationModelId: "fixture-deterministic-v1",
          attachments: [
            {
              id: "clean-file",
              filename: "proforma.pdf",
              declaredMime: "application/pdf",
              detectedMime: "application/pdf",
              sizeBytes: 42,
              sha256: "abc",
              scanStatus: "CLEAN",
              rejectionReason: null,
              downloadAllowed: true,
            },
            {
              id: "bad-file",
              filename: "offer.exe",
              declaredMime: "application/octet-stream",
              detectedMime: "application/octet-stream",
              sizeBytes: 3,
              sha256: "def",
              scanStatus: "REJECTED",
              rejectionReason: "EXECUTABLE_DENIED",
              downloadAllowed: false,
            },
          ],
          extractions: [
            {
              id: "field-1",
              fieldKey: "unit_price_at_quantity",
              value: { amounts: ["1.20", "1.80"], selected: null, verified: false },
              confidence: "0.2",
              snippet: "proforma.pdf p.1: Unit price USD 1.80",
              attachmentFilename: "proforma.pdf",
              page: 1,
              flag: "CONTRADICTION",
              reviewStatus: "UNREVIEWED",
            },
          ],
        },
      ],
      followUps: [
        {
          id: "follow-1",
          status: "DRAFT",
          subject: "Clarification needed",
          body: "This message is not an order.",
          sentAt: null,
          approvalHash: null,
        },
      ],
      events: [],
    },
  ],
};

describe("supplier inbox view", () => {
  it("shows the original and Serbian text, blocks unsafe downloads, and does not send the follow-up", () => {
    const html = renderToStaticMarkup(
      <SupplierInboxView model={model} locale="sr" projectId="project-1" />,
    );
    expect(html).toContain("Unit price USD 1.20 for 1000 pcs.");
    expect(html).toContain("Jedinična cena 1,20 USD za 1.000 komada.");
    expect(html).toContain("Prijem pošte je isključen");
    expect(html).toContain("proforma.pdf p.1");
    expect(html).toContain("Nepregledano");
    expect(html).toContain("href=\"/api/projects/project-1/supplier-inbox/attachments/clean-file\"");
    expect(html).not.toContain("attachments/bad-file");
    expect(html).toContain("disabled");
    expect(html).toContain("Nije poslato");
    expect(html).toContain("nije kupovina");
    expect(html).toContain("fixture");
  });
});
