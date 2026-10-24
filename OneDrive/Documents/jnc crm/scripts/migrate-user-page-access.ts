import { PrismaClient } from '@prisma/client';
import { getLegacyPagesForRole } from '../apps/api/src/auth/effective-page-access';
import { isValidCompanyPageKey, mapOldToNewPageKey } from '../apps/api/src/auth/page-registry';

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

export async function runUserPageAccessMigration(prisma: PrismaClient, options: MigrationOptions = {}) {
  const isExecute = Boolean(options.execute);
  const isDryRun = !isExecute || Boolean(options.dryRun);

  console.log(`\n======================================================`);
  console.log(`     GRANULAR PAGE ACCESS MIGRATION HELPER            `);
  console.log(`======================================================`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Preview counts only, no writes)' : 'EXECUTE (Single atomic transaction)'}\n`);

  // ─── 1. Map and migrate Team.allowedPages to canonical keys ─────────────────────
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

  // ─── 2. Identify Existing UserPageAccess Records (IDEMPOTENCY GUARD) ───────────
  const existingAccessList = await prisma.userPageAccess.findMany({
    select: { userId: true },
  });
  const existingAccessSet = new Set<string>(existingAccessList.map((r) => r.userId));

  // ─── 3. Query all company users ────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: {
      role: { not: 'platform_super_admin' },
      tenantId: { not: null },
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

  // ─── 4. Print Summary Counts Per Role Only ──────────────────────────────────────
  console.log(`--- Migration Counts per Role ---`);
  console.table(
    Object.values(statsByRole).map((s) => ({
      Role: s.role,
      'Total Users': s.totalUsers,
      'Already Configured (Preserved)': s.alreadyConfigured,
      'Newly Migrated': s.newlyMigrated,
    })),
  );
  console.log(`Teams scanned: ${teams.length} | Teams with keys mapped to canonical: ${teamUpdates.length}`);
  console.log(`Existing UserPageAccess records preserved: ${existingAccessSet.size}`);
  console.log(`New UserPageAccess records queued: ${pendingUserCreations.length}`);

  // ─── 5. Execution in Single Atomic Transaction ─────────────────────────────────
  if (isDryRun) {
    console.log(`\n[DRY-RUN COMPLETE] 0 database writes executed.`);
    console.log(`To commit these changes atomically, run with --execute.`);
  } else {
    console.log(`\n[EXECUTE] Executing all mutations in a single atomic transaction...`);

    const operations: any[] = [];

    // Update teams with canonical keys
    for (const tu of teamUpdates) {
      operations.push(
        prisma.team.update({
          where: { id: tu.id },
          data: { allowedPages: tu.newPages },
        }),
      );
    }

    // Insert new user page access rows (never updating existing ones)
    for (const uc of pendingUserCreations) {
      operations.push(
        prisma.userPageAccess.create({
          data: {
            userId: uc.userId,
            tenantId: uc.tenantId,
            pages: JSON.stringify(uc.pages),
          },
        }),
      );
    }

    if (operations.length > 0) {
      await prisma.$transaction(operations);
      console.log(`[EXECUTE COMPLETE] Successfully executed ${operations.length} operations in 1 transaction.\n`);
    } else {
      console.log(`[EXECUTE COMPLETE] Nothing to write — database is already fully up to date.\n`);
    }
  }

  return {
    statsByRole,
    teamUpdatesCount: teamUpdates.length,
    newCreationsCount: pendingUserCreations.length,
    preservedCount: existingAccessSet.size,
  };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const isExecute = process.argv.includes('--execute');
  const isDryRun = process.argv.includes('--dry-run');

  runUserPageAccessMigration(prisma, { execute: isExecute, dryRun: isDryRun })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
