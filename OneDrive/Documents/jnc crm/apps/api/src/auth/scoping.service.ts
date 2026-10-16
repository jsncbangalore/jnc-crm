/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, ForbiddenException } from '@nestjs/common';
import { requireTenantId } from '../common/tenant.util';
import { getVisibility, getCustomerListScope, ModelName, CustomerListScope } from './data-visibility';

export interface ScopedUser {
  id: string;
  tenantId?: string | null;
  employeeCode: string;
  role: string;
  teamId?: string | null;
  warehouseId?: string | null;
  tenant?: { id: string; code: string; name: string; slug: string; status: string } | null;
}

@Injectable()
export class ScopingService {

  getCustomerListScope(): CustomerListScope {
    return getCustomerListScope();
  }

  getTenantScope(user: ScopedUser) {
    if (user.role === 'platform_super_admin' && !user.tenantId) {
      throw new ForbiddenException('Platform administrators cannot access company workspace resources directly. Impersonate a client company to view their data.');
    }
    return { tenantId: requireTenantId(user) };
  }

  /**
   * Generic scope builder driven by VISIBILITY_TABLE.
   * Only Lead has assignedToId and shares relation.
   */
  getScope(user: ScopedUser, model: ModelName, overrideScope?: CustomerListScope): Record<string, any> {
    const tenantFilter = this.getTenantScope(user);
    const level = getVisibility(user.role, model, overrideScope);

    if (level === 'none') {
      throw new ForbiddenException(`Your role does not have access to ${model} records.`);
    }
    if (level === 'all') {
      return { ...tenantFilter };
    }

    const hasAssignment = model === 'Lead';
    const hasShares = model === 'Lead';

    if (level === 'team') {
      const clauses: any[] = [{ createdById: user.id }];
      if (hasAssignment) {
        clauses.push({ assignedToId: user.id });
        if (user.teamId) clauses.push({ assignedTo: { teamId: user.teamId } });
        clauses.push({ assignedToId: null });
      }
      return { ...tenantFilter, OR: clauses };
    }

    // 'own'
    const ownClauses: any[] = [{ createdById: user.id }];
    if (hasAssignment) ownClauses.push({ assignedToId: user.id });
    if (hasShares) ownClauses.push({ shares: { some: { userId: user.id } } });
    return { ...tenantFilter, OR: ownClauses };
  }

  getLeadScope(user: ScopedUser) { return this.getScope(user, 'Lead'); }
  getCompanyScope(user: ScopedUser, overrideScope?: CustomerListScope) { return this.getScope(user, 'Company', overrideScope); }
  getContactScope(user: ScopedUser, overrideScope?: CustomerListScope) { return this.getScope(user, 'Contact', overrideScope); }
  getQuotationScope(user: ScopedUser) { return this.getScope(user, 'Quotation'); }
  getOrderScope(user: ScopedUser) { return this.getScope(user, 'Order'); }
  getInvoiceScope(user: ScopedUser) { return this.getScope(user, 'Invoice'); }
  getSupplierScope(user: ScopedUser) { return this.getScope(user, 'Supplier'); }

  getInventoryScope(user: ScopedUser) {
    const tenantFilter = this.getTenantScope(user);
    const level = getVisibility(user.role, 'Inventory');
    if (level === 'none') throw new ForbiddenException('Your role does not have access to Inventory records.');
    if (user.role === 'sub_admin' && user.warehouseId) return { ...tenantFilter, warehouseId: user.warehouseId };
    return { ...tenantFilter };
  }

  getCustomObjectScope(user: ScopedUser) { return this.getTenantScope(user); }
  getProjectScope(user: ScopedUser) { return this.getTenantScope(user); }
}
