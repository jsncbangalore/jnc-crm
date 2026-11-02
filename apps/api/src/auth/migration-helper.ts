/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { getLegacyPagesForRole } from './effective-page-access';
import { isValidCompanyPageKey, mapOldToNewPageKey } from './page-registry';

export interface MigrationOptions {
  execute?: boolean;
  dryRun?: boolean;
}

export interface RoleMigrationStats {
  role: string;
  totalUsers: number;
  alreadyConfigured: number;
  newlyMigrated: number;
}

export interface MigrationResult {
  statsByRole: Record<string, RoleMigrationStats>;
  teamUpdatesCount: number;
  newCreationsCount: number;
  preservedCount: number;
  isDryRun: boolean;
}

export async function runUserPageAccessMigration(
  prisma: any,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const isExecute = Boolean(options.execute);
  const isDryRun = !isExecute || Boolean(options.dryRun);

  // 1. Map and migrate Team.allowedPages to canonical keys
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      allowedPages: true,
    },
  });

  const teamUpdates: { id: string; oldPages: string; newPages: string }[] = [];
  const teamMappedPagesCache = new Map<string, string[]>();

  for (const team of teams) {
    if (!team.allowedPages) continue;
    try {
      const rawParsed = typeof team.allowedPages === 'string' ? JSON.parse(team.allowedPages) : team.allowedPages;
      if (Array.isArray(rawParsed)) {
        const mapped = Array.from(
          new Set(
            rawParsed
              .map((p) => mapOldToNewPageKey(p))
              .filter((p): p is string => Boolean(p) && isValidCompanyPageKey(p)),
          ),
        );
        teamMappedPagesCache.set(team.id, mapped);

        const newPagesStr = JSON.stringify(mapped);
        if (newPagesStr !== team.allowedPages) {
          teamUpdates.push({
            id: team.id,
            oldPages: team.allowedPages,
            newPages: newPagesStr,
          });
        }
      }
    } catch {}
  }

  // 2. Identify Existing UserPageAccess Records (IDEMPOTENCY GUARD)
  const existingAccessList = await prisma.userPageAccess.findMany({
    select: { userId: true },
  });
  const existingAccessSet = new Set<string>(existingAccessList.map((r: any) => r.userId));

  // 3. Query all company users
  const users = await prisma.user.findMany({
    where: {
      role: { not: 'platform_super_admin' },
      tenantId: { not: null },
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      teamId: true,
    },
  });

  const statsByRole: Record<string, RoleMigrationStats> = {};
  const pendingUserCreations: { userId: string; tenantId: string; pages: string[] }[] = [];

  for (const user of users) {
    if (!user.tenantId) continue;

    if (!statsByRole[user.role]) {
      statsByRole[user.role] = {
        role: user.role,
        totalUsers: 0,
        alreadyConfigured: 0,
        newlyMigrated: 0,
      };
    }
    statsByRole[user.role].totalUsers++;

    // IDEMPOTENCY: If user already has a UserPageAccess row, NEVER overwrite it!
    if (existingAccessSet.has(user.id)) {
      statsByRole[user.role].alreadyConfigured++;
      continue;
    }

    // Determine canonical pages for the unconfigured user:
    let targetPages: string[] = [];
    if (user.teamId && teamMappedPagesCache.has(user.teamId)) {
      targetPages = teamMappedPagesCache.get(user.teamId) || [];
    }

    if (targetPages.length === 0) {
      targetPages = getLegacyPagesForRole(user.role);
    }

    statsByRole[user.role].newlyMigrated++;
    pendingUserCreations.push({
      userId: user.id,
      tenantId: user.tenantId,
      pages: targetPages,
    });
  }

  // 4. Execution in Single Atomic Transaction (if not dry run)
  if (!isDryRun) {
    const operations: any[] = [];

    for (const tu of teamUpdates) {
      operations.push(
        prisma.team.update({
          where: { id: tu.id },
          data: { allowedPages: tu.newPages },
        }),
      );
    }

    for (const uc of pendingUserCreations) {
      const defaultHomePage = uc.pages[0] || null;
      operations.push(
        prisma.userPageAccess.create({
          data: {
            userId: uc.userId,
            tenantId: uc.tenantId,
            pages: JSON.stringify({ pages: uc.pages, homePage: defaultHomePage }),
          },
        }),
      );
    }

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }
  }

  return {
    statsByRole,
    teamUpdatesCount: teamUpdates.length,
    newCreationsCount: pendingUserCreations.length,
    preservedCount: existingAccessSet.size,
    isDryRun,
  };
}
