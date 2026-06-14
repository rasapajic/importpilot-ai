import { DocumentType, OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("document vault tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/documents/application/document-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let documentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/documents/application/document-service");

    const user = await prisma.user.create({
      data: { email: `vault-${crypto.randomUUID()}@example.test`, name: "Vault Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Vault Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Vault Org" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Vault Project",
        targetCountry: "DE",
        quantity: 100,
        targetMargin: 20,
      },
    });
    const offer = await prisma.supplierOffer.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        supplierName: "Vault Supplier",
      },
    });
    const document = await prisma.uploadedFile.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        linkedOfferId: offer.id,
        documentType: DocumentType.PROFORMA,
        originalFilename: "proforma.pdf",
        mimeType: "application/pdf",
        size: 100,
        checksum: "a".repeat(64),
        storageKey: `organizations/${organization.id}/projects/${project.id}/proforma.pdf`,
      },
    });

    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    documentId = document.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("keeps document metadata and offer links inside the tenant", async () => {
    await expect(service.findTenantDocument(documentId, organizationId)).resolves.toMatchObject({
      id: documentId,
      documentType: DocumentType.PROFORMA,
    });
    await expect(service.findTenantDocument(documentId, otherOrganizationId)).resolves.toBeNull();
  });

  it("does not create a download URL for another tenant", async () => {
    await expect(
      service.getDocumentDownloadUrl(documentId, otherOrganizationId),
    ).rejects.toBeInstanceOf(service.DocumentNotFoundError);
  });

  it("rejects another tenant before attempting document deletion", async () => {
    await expect(
      service.deleteDocument(documentId, otherOrganizationId),
    ).rejects.toBeInstanceOf(service.DocumentNotFoundError);
    await expect(service.findTenantDocument(documentId, organizationId)).resolves.toMatchObject({
      id: documentId,
    });
  });
});
