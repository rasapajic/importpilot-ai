import { createHash, randomBytes } from "node:crypto";

import type { OrganizationRole, Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/database/prisma";
import { hasRole } from "@/modules/auth/domain/authorization";
import { SESSION_COOKIE } from "@/modules/auth/domain/constants";
import type { RequestContext } from "@/modules/auth/infrastructure/request-context";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_ROTATION_AGE_MS = 1000 * 60 * 60 * 24;

export { SESSION_COOKIE };

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionData(
  userId: string,
  activeOrganizationId: string,
  context: RequestContext,
): { token: string; data: Prisma.SessionUncheckedCreateInput } {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      activeOrganizationId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  };
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export async function validateSessionToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const membership = session.user.memberships.find(
    (item) => item.organizationId === session.activeOrganizationId,
  );
  if (!membership) return null;

  return { session, user: session.user, membership };
}

export async function rotateSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.expiresAt <= new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() < SESSION_ROTATION_AGE_MS) return null;

  const nextToken = randomBytes(32).toString("base64url");
  const rotated = await prisma.session.updateMany({
    where: {
      id: session.id,
      tokenHash,
      lastSeenAt: { lt: new Date(Date.now() - SESSION_ROTATION_AGE_MS) },
    },
    data: {
      tokenHash: hashSessionToken(nextToken),
      lastSeenAt: new Date(),
    },
  });
  if (rotated.count !== 1) return null;

  return { token: nextToken, expiresAt: session.expiresAt };
}

export async function requireSession() {
  const auth = await getCurrentSession();
  if (!auth) redirect("/login");
  return auth;
}

export async function requireRole(roles: OrganizationRole[]) {
  const auth = await requireSession();
  if (!hasRole(auth.membership.role, roles)) redirect("/dashboard?error=forbidden");
  return auth;
}
