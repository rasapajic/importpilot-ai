import type { OrganizationRole } from "@prisma/client";

export function hasRole(currentRole: OrganizationRole, allowedRoles: OrganizationRole[]) {
  return allowedRoles.includes(currentRole);
}

