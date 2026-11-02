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

  // 1. Platform Super Admin & Platform Admin
  if (user.role === 'platform_super_admin' || user.role === 'platform_admin') {
    if (user.tenantId) {
      return [...ALL_COMPANY_PAGE_KEYS];
    }
    return [...ALL_PLATFORM_PAGE_KEYS];
  }

  // 2. Tenant Admin has full access to all company modules
  if (user.role === 'tenant_admin' || user.role === 'admin') {
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
        return parsed.map((k: string) => (k === 'purchase_bills' ? 'bills' : k)).filter((key: string) => isValidCompanyPageKey(key));
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pages)) {
        return parsed.pages.map((k: string) => (k === 'purchase_bills' ? 'bills' : k)).filter((key: string) => isValidCompanyPageKey(key));
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
        return parsedTeam.map((k: string) => (k === 'purchase_bills' ? 'bills' : k)).filter((key: string) => isValidCompanyPageKey(key));
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
 * Returns the resolved home page key for a user:
 * 1. Explicitly configured homePage from UserPageAccess (if granted to user)
 * 2. Otherwise the first granted page in canonical registry order
 * 3. null if user has zero pages
 */
export async function getHomePageForUser(
  prisma: PrismaService,
  user: { id: string; role?: string; tenantId?: string | null },
): Promise<string | null> {
  if (!user || !user.id) return null;

  if (user.role === 'platform_super_admin' && !user.tenantId) {
    return 'platform_companies';
  }

  const effective = await getEffectivePagesForUser(prisma, user);
  if (effective.length === 0) return null;

  // Check explicit UserPageAccess for configured homePage
  try {
    const userAccess = await prisma.userPageAccess.findUnique({
      where: { userId: user.id },
    });
    if (userAccess && userAccess.pages) {
      const parsed = typeof userAccess.pages === 'string' ? JSON.parse(userAccess.pages) : userAccess.pages;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.homePage) {
        if (effective.includes(parsed.homePage)) {
          return parsed.homePage;
        }
      }
    }
  } catch {}

  // Fallback: first granted page in registry order
  for (const key of ALL_COMPANY_PAGE_KEYS) {
    if (effective.includes(key)) {
      return key;
    }
  }

  return effective[0] || null;
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
        'bills',
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
        'bills',
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
        'bills',
        'ledger',
        'suppliers',
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
