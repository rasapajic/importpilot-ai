import {
  ProjectActivityType,
  ProjectCompletionStatus,
  type Prisma,
} from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { deleteStoredObject } from "@/lib/storage/s3";
import { isFinalDecisionStatus } from "@/modules/decisions/application/decision-step-summary";
import { canDeleteEmptySearch } from "@/modules/projects/domain/empty-search-deletion";
import type {
  createProjectSchema,
  listProjectsSchema,
} from "@/modules/projects/domain/validation";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";
import { DEMO_PROJECT_PREFIX, isDemoProjectName } from "@/modules/projects/domain/project-access";

type CreateProjectInput = z.infer<typeof createProjectSchema>;
type ListProjectsInput = z.infer<typeof listProjectsSchema>;

export class DemoProjectNotFoundError extends Error {}
export class ProductionProjectDeletionNotAllowedError extends Error {}
export class EmptySearchProjectNotFoundError extends Error {}
export class EmptySearchProjectDeletionNotAllowedError extends Error {}

export function createProject(
  input: CreateProjectInput,
  organizationId: string,
  userId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.importProject.create({
      data: { ...input, organizationId, createdById: userId },
    });
    await transaction.projectCompletionHistory.create({
      data: {
        organizationId,
        projectId: project.id,
        status: ProjectCompletionStatus.ACTIVE,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: project.id,
      type: ProjectActivityType.PROJECT_CREATED,
      title: "Projekat je kreiran",
      metadata: { projectName: project.name },
    });
    return project;
  });
}

export async function listProjects(input: ListProjectsInput, organizationId: string) {
  const where: Prisma.ImportProjectWhereInput = {
    organizationId,
    status: input.status,
    completionStatus: input.completionStatus,
    targetCountry: input.targetCountry,
    name: input.search
      ? { contains: input.search, mode: "insensitive" }
      : undefined,
  };
  const [projects, total] = await prisma.$transaction([
    prisma.importProject.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        _count: { select: { files: true, offers: true } },
        offers: {
          select: {
            costCalculations: { select: { id: true }, take: 1 },
            assessments: { select: { id: true }, take: 1 },
          },
        },
        projectDecisions: {
          orderBy: { createdAt: "desc" },
          select: { status: true },
          take: 1,
        },
      },
    }),
    prisma.importProject.count({ where }),
  ]);

  return {
    projects,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export function findOrganizationProject(projectId: string, organizationId: string) {
  return prisma.importProject.findFirst({ where: { id: projectId, organizationId } });
}

export function getProject(projectId: string, organizationId: string) {
  return prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
        include: {
          jobs: { orderBy: { createdAt: "desc" } },
          supplierOffer: true,
          linkedOffer: { select: { id: true, supplierName: true } },
        },
      },
      offers: {
        orderBy: { createdAt: "desc" },
        include: {
          costCalculations: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          assessments: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}

export async function deleteDemoProject(
  projectId: string,
  organizationId: string,
  deleteObject: (storageKey: string) => Promise<void> = deleteStoredObject,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      files: { select: { storageKey: true } },
    },
  });
  if (!project) throw new DemoProjectNotFoundError();
  if (!isDemoProjectName(project.name)) {
    throw new ProductionProjectDeletionNotAllowedError();
  }

  for (const file of project.files) await deleteObject(file.storageKey);

  const deleted = await prisma.importProject.deleteMany({
    where: {
      id: project.id,
      organizationId,
      name: { startsWith: DEMO_PROJECT_PREFIX },
    },
  });
  if (deleted.count !== 1) throw new DemoProjectNotFoundError();
}

export async function deleteEmptySearchProject(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      files: { select: { id: true }, take: 1 },
      offers: {
        select: {
          id: true,
          costCalculations: { select: { id: true }, take: 1 },
        },
      },
      costCalculations: { select: { id: true }, take: 1 },
      projectDecisions: { select: { status: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) throw new EmptySearchProjectNotFoundError();

  const hasCalculations =
    project.costCalculations.length > 0 ||
    project.offers.some((offer) => offer.costCalculations.length > 0);
  const hasCompletedRecommendation = project.projectDecisions.some((decision) =>
    isFinalDecisionStatus(decision.status),
  );

  if (!canDeleteEmptySearch({
    offerCount: project.offers.length,
    calculationCount: hasCalculations ? 1 : 0,
    documentCount: project.files.length,
    hasCompletedRecommendation,
  })) {
    throw new EmptySearchProjectDeletionNotAllowedError();
  }

  const deleted = await prisma.importProject.deleteMany({
    where: { id: project.id, organizationId },
  });
  if (deleted.count !== 1) throw new EmptySearchProjectNotFoundError();
}
