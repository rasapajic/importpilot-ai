import { AuditAction, OrganizationRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { hashPassword, verifyPassword } from "@/modules/auth/infrastructure/password";
import type { RequestContext } from "@/modules/auth/infrastructure/request-context";
import {
  createSessionData,
  hashSessionToken,
} from "@/modules/auth/infrastructure/session";
import type {
  loginSchema,
  registerSchema,
} from "@/modules/auth/domain/validation";
import type { z } from "zod";

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

export class EmailAlreadyExistsError extends Error {}
export class InvalidCredentialsError extends Error {}

export async function register(input: RegisterInput, context: RequestContext) {
  const passwordHash = await hashPassword(input.password);
  const ids = {
    userId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
  };
  const session = createSessionData(ids.userId, ids.organizationId, context);

  try {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: ids.userId,
          email: input.email,
          name: input.name,
          passwordHash,
        },
      }),
      prisma.organization.create({
        data: { id: ids.organizationId, name: input.organizationName },
      }),
      prisma.organizationMember.create({
        data: {
          userId: ids.userId,
          organizationId: ids.organizationId,
          role: OrganizationRole.OWNER,
        },
      }),
      prisma.session.create({ data: session.data }),
      prisma.auditEvent.create({
        data: {
          action: AuditAction.AUTH_REGISTERED,
          userId: ids.userId,
          organizationId: ids.organizationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new EmailAlreadyExistsError();
    }
    throw error;
  }

  return session.token;
}

export async function login(input: LoginInput, context: RequestContext) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });

  const valid = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await hashPassword(input.password).then(() => false);
  const membership = user?.memberships[0];

  if (!user || !valid || !membership) {
    await prisma.auditEvent.create({
      data: {
        action: AuditAction.AUTH_LOGIN_FAILED,
        userId: user?.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    throw new InvalidCredentialsError();
  }

  const session = createSessionData(user.id, membership.organizationId, context);
  await prisma.$transaction([
    prisma.session.create({ data: session.data }),
    prisma.auditEvent.create({
      data: {
        action: AuditAction.AUTH_LOGIN_SUCCEEDED,
        userId: user.id,
        organizationId: membership.organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }),
  ]);

  return session.token;
}

export async function logout(token: string | undefined, context: RequestContext) {
  if (!token) return;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!session) return;

  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.auditEvent.create({
      data: {
        action: AuditAction.AUTH_LOGOUT,
        userId: session.userId,
        organizationId: session.activeOrganizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }),
  ]);
}
