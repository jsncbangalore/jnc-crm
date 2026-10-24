/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_COMPANY_PAGE_KEYS,
  ALL_PLATFORM_PAGE_KEYS,
  isValidCompanyPageKey,
} from './page-registry';

/**
 * Computes the exact effective page access list for a user.
 * 
 * Rules:
 * 1. platform_super_admin: platform pages (or all company pages when impersonating a tenant)
 * 2. tenant_admin: all company pages
 * 3. others:
 *    a) User's own UserPageAccess list if record exists
 *    b) else Team's allowedPages if user has a team assigned
 *    c) else [] empty list (no team means NO ACCESS)
 */
export async function getEffectivePagesForUser(
  prisma: PrismaService,
  user: { id: string; role?: string; tenantId?: string | null },
): Promise<string[]> {
  if (!user || !user.id) {
    return [];
  }

  // 1. Platform Super Admin
  if (user.role === 'platform_super_admin') {
    if (user.tenantId) {
      return [...ALL_COMPANY_PAGE_KEYS];
    }
    return [...ALL_PLATFORM_PAGE_KEYS];
  }

  // 2. Tenant Admin has full access to all company modules
  if (user.role === 'tenant_admin') {
    return [...ALL_COMPANY_PAGE_KEYS];
  }

  // 3. Check User's explicit UserPageAccess record
  try {
    const userAccess = await prisma.userPageAccess.findUnique({
      where: { userId: user.id },
    });

    if (userAccess && userAccess.pages) {
      const parsed = typeof userAccess.pages === 'string' ? JSON.parse(userAccess.pages) : userAccess.pages;
      if (Array.isArray(parsed)) {
        return parsed.filter((key: string) => isValidCompanyPageKey(key));
      }
    }
  } catch (err) {
    // If table doesn't exist yet, continue to team fallback
  }

  // 4. Fallback to Team allowedPages if user has an assigned team
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { teamRef: true },
    });

    if (dbUser && dbUser.teamId && dbUser.teamRef && dbUser.teamRef.allowedPages) {
      const parsedTeam =
        typeof dbUser.teamRef.allowedPages === 'string'
          ? JSON.parse(dbUser.teamRef.allowedPages)
          : dbUser.teamRef.allowedPages;
      if (Array.isArray(parsedTeam)) {
        return parsedTeam.filter((key: string) => isValidCompanyPageKey(key));
      }
    }
  } catch (err) {
    // DB query error, fail closed
    return [];
  }

  // 5. Default: No team and no custom access means empty list (no page access)
  return [];
}

/**
 * Returns default legacy page permissions for an existing role.
 * Used exclusively by the migration helper script to backfill existing users.
 */
export function getLegacyPagesForRole(role: string): string[] {
  switch (role) {
    case 'tenant_admin':
    case 'admin':
      return [...ALL_COMPANY_PAGE_KEYS];
    case 'sub_admin':
      return [
        'dashboard',
        'leads',
        'lead_flow',
        'quotations',
        'orders',
        'invoices',
        'inventory',
        'suppliers',
        'purchase_bills',
        'shipments',
        'daily_activities',
        'notifications',
      ].filter((k) => isValidCompanyPageKey(k));
    case 'project_manager':
    case 'developer_lead':
    case 'developer':
      return ['daily_activities', 'notifications'].filter((k) => isValidCompanyPageKey(k));
    case 'store_manager':
      return [
        'dashboard',
        'orders',
        'inventory',
        'suppliers',
        'purchase_bills',
        'shipments',
        'notifications',
      ].filter((k) => isValidCompanyPageKey(k));
    case 'finance':
    case 'accountant':
      return [
        'dashboard',
        'quotations',
        'orders',
        'invoices',
        'suppliers',
        'purchase_bills',
        'notifications',
      ].filter((k) => isValidCompanyPageKey(k));
    case 'employee':
      return [
        'dashboard',
        'leads',
        'lead_flow',
        'quotations',
        'orders',
        'notifications',
      ].filter((k) => isValidCompanyPageKey(k));
    default:
      return ['dashboard', 'notifications'].filter((k) => isValidCompanyPageKey(k));
  }
}
