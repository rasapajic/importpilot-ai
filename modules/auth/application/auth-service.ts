import {
  AuditAction,
  OAuthProvider,
  OrganizationRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import type { GoogleIdentity } from "@/modules/auth/infrastructure/google-oauth";
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
export class GoogleIdentityUnavailableError extends Error {}

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

async function googleSignInTransaction(identity: GoogleIdentity, context: RequestContext) {
  return prisma.$transaction(async (tx) => {
    const existingAccount = await tx.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: identity.providerAccountId,
        },
      },
      include: {
        user: {
          include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
        },
      },
    });

    if (existingAccount) {
      const membership = existingAccount.user.memberships[0];
      if (!membership) throw new GoogleIdentityUnavailableError();
      const session = createSessionData(
        existingAccount.user.id,
        membership.organizationId,
        context,
      );
      await tx.session.create({ data: session.data });
      await tx.auditEvent.create({
        data: {
          action: AuditAction.AUTH_LOGIN_SUCCEEDED,
          userId: existingAccount.user.id,
          organizationId: membership.organizationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { provider: "GOOGLE" },
        },
      });
      return session.token;
    }

    const existingUser = await tx.user.findUnique({
      where: { email: identity.email },
      include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
    });

    if (existingUser) {
      const membership = existingUser.memberships[0];
      if (!membership) throw new GoogleIdentityUnavailableError();
      await tx.oAuthAccount.create({
        data: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: identity.providerAccountId,
          userId: existingUser.id,
        },
      });
      const session = createSessionData(existingUser.id, membership.organizationId, context);
      await tx.session.create({ data: session.data });
      await tx.auditEvent.create({
        data: {
          action: AuditAction.AUTH_LOGIN_SUCCEEDED,
          userId: existingUser.id,
          organizationId: membership.organizationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { provider: "GOOGLE", linkedExistingUser: true },
        },
      });
      return session.token;
    }

    const userId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const organizationName = identity.name.trim().slice(0, 160) || identity.email.slice(0, 160);
    const session = createSessionData(userId, organizationId, context);

    await tx.user.create({
      data: {
        id: userId,
        email: identity.email,
        name: identity.name,
        passwordHash: null,
      },
    });
    await tx.organization.create({
      data: { id: organizationId, name: organizationName },
    });
    await tx.organizationMember.create({
      data: {
        userId,
        organizationId,
        role: OrganizationRole.OWNER,
      },
    });
    await tx.oAuthAccount.create({
      data: {
        provider: OAuthProvider.GOOGLE,
        providerAccountId: identity.providerAccountId,
        userId,
      },
    });
    await tx.session.create({ data: session.data });
    await tx.auditEvent.create({
      data: {
        action: AuditAction.AUTH_REGISTERED,
        userId,
        organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { provider: "GOOGLE" },
      },
    });
    await tx.auditEvent.create({
      data: {
        action: AuditAction.AUTH_LOGIN_SUCCEEDED,
        userId,
        organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { provider: "GOOGLE" },
      },
    });

    return session.token;
  });
}

export async function loginWithGoogle(identity: GoogleIdentity, context: RequestContext) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await googleSignInTransaction(identity, context);
    } catch (error) {
      const raceConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!raceConflict || attempt === 1) throw error;
    }
  }
  throw new GoogleIdentityUnavailableError();
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
