import {
  OrganizationRole,
  ProcessingJobStatus,
  ProcessingJobType,
  ProjectStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("projects and ingestion pipeline integration", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let projectService: typeof import("@/modules/projects/application/project-service");
  let queue: typeof import("@/lib/queue/postgres-job-queue").jobQueue;
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let projectId: string;
  let fileId: string;
  let sessionToken: string;
  let projectRoute: typeof import("@/app/api/projects/[projectId]/route");

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    projectService = await import("@/modules/projects/application/project-service");
    ({ jobQueue: queue } = await import("@/lib/queue/postgres-job-queue"));
    projectRoute = await import("@/app/api/projects/[projectId]/route");

    const user = await prisma.user.create({
      data: { email: `projects-${crypto.randomUUID()}@example.test`, name: "Project Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Projects Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Tenant" } });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    const sessionService = await import("@/modules/auth/infrastructure/session");
    const session = sessionService.createSessionData(user.id, organization.id, {
      ipAddress: "127.0.0.1",
      userAgent: "Project detail integration test",
    });
    sessionToken = session.token;
    await prisma.session.create({ data: session.data });
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates an organization-scoped draft project", async () => {
    const project = await projectService.createProject(
      { name: "Solar Panels", targetCountry: "DE", quantity: 500, targetMargin: 22.5 },
      organizationId,
      userId,
    );
    projectId = project.id;
    expect(project.status).toBe(ProjectStatus.DRAFT);
    expect(project.organizationId).toBe(organizationId);
  });

  it("opens a newly created empty project with 200 OK", async () => {
    const response = await projectRoute.GET(
      new NextRequest(`http://localhost/api/projects/${projectId}`, {
        headers: { cookie: `tradepilot_session=${sessionToken}` },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: projectId, exists: true });
  });

  it("searches, filters and paginates without leaking tenants", async () => {
    await projectService.createProject(
      { name: "Other Tenant Solar Panels", targetCountry: "DE", quantity: 1, targetMargin: 1 },
      otherOrganizationId,
      userId,
    );
    const result = await projectService.listProjects(
      { search: "Solar", status: ProjectStatus.DRAFT, targetCountry: "DE", page: 1, pageSize: 1 },
      organizationId,
    );
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].organizationId).toBe(organizationId);
    expect(result.pagination.total).toBe(1);
  });

  it("creates, retries and dead-letters processing jobs", async () => {
    const file = await prisma.uploadedFile.create({
      data: {
        organizationId,
        projectId,
        originalFilename: "offer.pdf",
        mimeType: "application/pdf",
        size: 100,
        checksum: "a".repeat(64),
        storageKey: `organizations/${organizationId}/projects/${projectId}/offer.pdf`,
      },
    });
    fileId = file.id;
    const job = await queue.enqueue({
      type: ProcessingJobType.OCR_EXTRACTION,
      fileId,
      payload: { fileId },
      maxAttempts: 2,
    });
    const retried = await queue.retry(job.id, "temporary failure", 1);
    expect(retried.status).toBe(ProcessingJobStatus.RETRY_SCHEDULED);
    const dead = await queue.retry(job.id, "permanent failure", 1);
    expect(dead.status).toBe(ProcessingJobStatus.DEAD_LETTER);
    expect(dead.deadLetteredAt).not.toBeNull();
  });
});
