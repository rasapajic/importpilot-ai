import { AuditAction, OrganizationRole } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { hasRole } from "@/modules/auth/domain/authorization";
import { validateSessionToken } from "@/modules/auth/infrastructure/session";

export class MetricsAccessDeniedError extends Error {}

export async function getAuthMetrics(token: string | undefined) {
  const auth = token ? await validateSessionToken(token) : null;
  if (
    !auth ||
    !hasRole(auth.membership.role, [OrganizationRole.OWNER, OrganizationRole.ADMIN])
  ) {
    throw new MetricsAccessDeniedError();
  }

  const [success, failed, active] = await Promise.all([
    prisma.auditEvent.count({ where: { action: AuditAction.AUTH_LOGIN_SUCCEEDED } }),
    prisma.auditEvent.count({ where: { action: AuditAction.AUTH_LOGIN_FAILED } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  return { success, failed, active };
}

