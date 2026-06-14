import { ProjectActivityType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";

type TransactionClient = Prisma.TransactionClient;

export const ProjectActivityTypes = Object.values(ProjectActivityType);

export function recordProjectActivity(
  transaction: TransactionClient,
  input: {
    organizationId: string;
    projectId: string;
    type: ProjectActivityType;
    title: string;
    description?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return transaction.projectActivity.create({ data: input });
}

export async function listProjectActivities(
  projectId: string,
  organizationId: string,
  type?: ProjectActivityType,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) return null;

  return prisma.projectActivity.findMany({
    where: { projectId, organizationId, type },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}
