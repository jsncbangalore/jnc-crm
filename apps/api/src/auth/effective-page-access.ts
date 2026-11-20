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
import {
  resolveEffectivePageAccess,
  getRoleDefaultPermissions,
  EffectiveAccessResult,
  normalizeRole,
} from '../common/roles-permissions';

// Short in-memory cache for performance (5-second TTL). Changes take effect within seconds without relogin.
interface CacheEntry {
  result: EffectiveAccessResult;
  timestamp: number;
}
const accessCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;

export function invalidateUserAccessCache(userId: string): void {
  accessCache.delete(userId);
}

/**
 * Computes the exact effective page access and permissions for a user.
 * 
 * Rules (Requirement B & D):
 * 1. Administrator: ALL pages, ALL actions, no restriction. Team restrictions never apply.
 * 2. Effective access = role default, then the user/team changes.
 * 3. An empty team page list does NOT block everything; it uses role defaults.
 * 4. Dashboard and notifications are always allowed for every role.
 */
export async function getEffectivePermissionsForUser(
  prisma: PrismaService,
  user: { id: string; role?: string; tenantId?: string | null },
): Promise<EffectiveAccessResult> {
  if (!user || !user.id) {
    return { pages: [], permissions: {} };
  }

  const now = Date.now();
  const cached = accessCache.get(user.id);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // 1. Platform Super Admin / Platform Admin without tenant
  if ((user.role === 'platform_super_admin' || user.role === 'platform_admin') && !user.tenantId) {
    const res = resolveEffectivePageAccess({
      role: user.role,
      isPlatform: true,
    });
    accessCache.set(user.id, { result: res, timestamp: now });
    return res;
  }

  // 2. Administrator has full access to all company modules
  const normalizedRole = normalizeRole(user.role);
  if (normalizedRole === 'administrator') {
    const res = resolveEffectivePageAccess({
      role: 'administrator',
    });
    accessCache.set(user.id, { result: res, timestamp: now });
    return res;
  }

  // 3. Query UserPageAccess and Team.allowedPages from Database
  let userPages: string[] | null = null;
  let teamAllowedPages: string[] | null = null;

  try {
    const [userAccess, dbUser] = await Promise.all([
      prisma.userPageAccess.findUnique({
        where: { userId: user.id },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          teamId: true,
          teamRef: { select: { allowedPages: true } },
        },
      }),
    ]);

    if (userAccess && userAccess.pages) {
      const parsed = typeof userAccess.pages === 'string' ? JSON.parse(userAccess.pages) : userAccess.pages;
      if (Array.isArray(parsed)) {
        userPages = parsed.map((k: string) => (k === 'purchase_bills' ? 'bills' : k));
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pages)) {
        userPages = parsed.pages.map((k: string) => (k === 'purchase_bills' ? 'bills' : k));
      }
    }

    if (dbUser && dbUser.teamRef && dbUser.teamRef.allowedPages) {
      const parsedTeam = typeof dbUser.teamRef.allowedPages === 'string'
        ? JSON.parse(dbUser.teamRef.allowedPages)
        : dbUser.teamRef.allowedPages;
      if (Array.isArray(parsedTeam)) {
        teamAllowedPages = parsedTeam.map((k: string) => (k === 'purchase_bills' ? 'bills' : k));
      }
    }

    const effectiveRole = dbUser?.role || user.role;

    const res = resolveEffectivePageAccess({
      role: effectiveRole,
      userPages,
      teamAllowedPages,
    });

    accessCache.set(user.id, { result: res, timestamp: now });
    return res;
  } catch (err) {
    // If DB fails, fallback cleanly to role defaults
    const res = resolveEffectivePageAccess({
      role: user.role,
    });
    return res;
  }
}

/**
 * Returns string array of granted page keys for backward compatibility.
 */
export async function getEffectivePagesForUser(
  prisma: PrismaService,
  user: { id: string; role?: string; tenantId?: string | null },
): Promise<string[]> {
  const perms = await getEffectivePermissionsForUser(prisma, user);
  return perms.pages;
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

  // Fallback: first granted page in registry order (prefer non-notification)
  for (const key of ALL_COMPANY_PAGE_KEYS) {
    if (key !== 'notifications' && effective.includes(key)) {
      return key;
    }
  }

  return effective[0] || null;
}

/**
 * Returns default page list for a role.
 */
export function getLegacyPagesForRole(role: string): string[] {
  const perms = getRoleDefaultPermissions(role);
  return Object.keys(perms).filter((k) => isValidCompanyPageKey(k));
}
