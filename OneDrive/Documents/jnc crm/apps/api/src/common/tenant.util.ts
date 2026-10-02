import { ForbiddenException } from '@nestjs/common';

/**
 * Enforces that a valid tenantId is provided for tenant-scoped operations.
 * Throws ForbiddenException if no tenantId is found.
 */
export function requireTenantId(userOrTenantId?: { tenantId?: string | null; role?: string } | string | null): string {
  if (typeof userOrTenantId === 'string') {
    const trimmed = userOrTenantId.trim();
    if (trimmed) return trimmed;
    throw new ForbiddenException('Tenant context is required for this operation.');
  }

  if (userOrTenantId?.tenantId) {
    return userOrTenantId.tenantId;
  }

  throw new ForbiddenException('Tenant context is required for this operation.');
}
