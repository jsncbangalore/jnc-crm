/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ForbiddenException } from '@nestjs/common';
import { requireTenantId } from '../common/tenant.util';

export interface ScopedUser {
  id: string;
  tenantId?: string | null;
  employeeCode: string;
  role: string;
  teamId?: string | null;
  warehouseId?: string | null;
  tenant?: {
    id: string;
    code: string;
    name: string;
    slug: string;
    status: string;
  } | null;
}

@Injectable()
export class ScopingService {
  /**
   * Enforces strict Tenant Isolation.
   * Platform administrators must impersonate a tenant to access tenant-scoped records.
   */
  getTenantScope(user: ScopedUser) {
    if (user.role === 'platform_super_admin' && !user.tenantId) {
      throw new ForbiddenException(
        'Platform administrators cannot access company workspace resources directly. Impersonate a client company to view their data.',
      );
    }
    return {
      tenantId: requireTenantId(user),
    };
  }

  /**
   * Generates Prisma `where` clause for Leads based on tenant and role
   */
  getLeadScope(user: ScopedUser) {
    const tenantFilter = this.getTenantScope(user);

    if (user.role === 'tenant_admin' || user.role === 'admin') {
      return { ...tenantFilter };
    }

    if (user.role === 'sub_admin') {
      if (user.teamId) {
        return {
          ...tenantFilter,
          OR: [
            { assignedTo: { teamId: user.teamId } },
            { assignedToId: user.id },
            { assignedToId: null },
          ],
        };
      }
      return { ...tenantFilter };
    }

    // Employee / Sales Rep: Assigned leads OR leads shared with them inside same tenant
    return {
      ...tenantFilter,
      OR: [
        { assignedToId: user.id },
        { shares: { some: { userId: user.id } } },
      ],
    };
  }

  /**
   * Generates Prisma `where` clause for Orders based on tenant and role
   */
  getOrderScope(user: ScopedUser) {
    const tenantFilter = this.getTenantScope(user);

    if (user.role === 'platform_super_admin' || user.role === 'tenant_admin' || user.role === 'admin' || user.role === 'sub_admin') {
      return { ...tenantFilter };
    }

    // Employee: Only orders created by them
    return {
      ...tenantFilter,
      createdById: user.id,
    };
  }

  /**
   * Generates Prisma `where` clause for Invoices based on tenant and role
   */
  getInvoiceScope(user: ScopedUser) {
    return this.getTenantScope(user);
  }

  /**
   * Generates Prisma `where` clause for Inventory / Stock Movements based on tenant & warehouse
   */
  getInventoryScope(user: ScopedUser) {
    const tenantFilter = this.getTenantScope(user);

    if (user.role === 'platform_super_admin' || user.role === 'tenant_admin' || user.role === 'admin' || user.role === 'store_manager') {
      return { ...tenantFilter };
    }

    if (user.role === 'sub_admin' && user.warehouseId) {
      return {
        ...tenantFilter,
        warehouseId: user.warehouseId,
      };
    }

    return { ...tenantFilter };
  }

  /**
   * Custom Objects and Records Scope
   */
  getCustomObjectScope(user: ScopedUser) {
    return this.getTenantScope(user);
  }

  /**
   * Projects Scope
   */
  getProjectScope(user: ScopedUser) {
    return this.getTenantScope(user);
  }
}
