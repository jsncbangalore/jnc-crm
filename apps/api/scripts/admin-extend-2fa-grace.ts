/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';

// Server CLI 2FA grace period extension tool.
// Requires CONFIRM_PRODUCTION=yes in production, writes audit log,
// and NEVER outputs secrets or passwords.
// Usage: npm run admin:extend-2fa-grace -- --email <email> --days N

function parseArgs(): { email?: string; days?: number } {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let days: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && i + 1 < args.length) {
      email = args[i + 1].trim();
      i++;
    } else if (arg.startsWith('--email=')) {
      email = arg.split('=')[1].trim();
    } else if (arg === '--days' && i + 1 < args.length) {
      days = parseInt(args[i + 1].trim(), 10);
      i++;
    } else if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1].trim(), 10);
    } else if (arg.includes('@') && !email) {
      email = arg.trim();
    } else if (!isNaN(parseInt(arg, 10)) && days === undefined) {
      days = parseInt(arg.trim(), 10);
    }
  }

  return { email, days };
}

async function main() {
  console.log('========================================================================');
  console.log('       CRM DIRECT SERVER 2-STEP (2FA) GRACE PERIOD EXTENSION CLI        ');
  console.log('========================================================================\n');

  // Guard: Must explicitly confirm production mode if in production
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('[SECURITY ERROR] Direct 2FA grace extension in production requires CONFIRM_PRODUCTION=yes.');
    console.error('Usage: CONFIRM_PRODUCTION=yes npm run admin:extend-2fa-grace -- --email <email> --days N\n');
    process.exit(1);
  }

  const { email, days: parsedDays } = parseArgs();
  if (!email || !email.includes('@')) {
    console.error('[ERROR] A valid --email argument is required.');
    console.error('Usage: npm run admin:extend-2fa-grace -- --email <email> --days N\n');
    process.exit(1);
  }

  const days = parsedDays !== undefined && !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 7;
  const cleanEmail = email.trim().toLowerCase();

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' }, deletedAt: null },
      include: { tenant: true },
    });

    if (!user) {
      console.error(`[ERROR] No active account found matching email: ${cleanEmail}`);
      process.exit(1);
    }

    // Set firstLoginAfter2FaReleaseAt such that (7 - elapsed_days) = days remaining
    // gracePeriodMs = 7 * 86400000. To have `days` days remaining from now:
    // elapsed = (7 - days) * 86400000.
    // firstLogin = now - elapsed = now - (7 - days) * 86400000
    const newFirstLogin = new Date(Date.now() - (7 - days) * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAfter2FaReleaseAt: newFirstLogin,
      },
    });

    // Write audit log (never logs passwords or secrets)
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'platform',
        actorId: null,
        actorName: 'CLI_SERVER_ADMIN',
        action: '2FA_GRACE_PERIOD_EXTENDED',
        entityName: 'User',
        entityId: user.id,
        afterState: JSON.stringify({
          email: user.email,
          role: user.role,
          extendedDays: days,
          newFirstLogin: newFirstLogin.toISOString(),
          executedAt: new Date().toISOString(),
        }),
      },
    });

    console.log(`[SUCCESS] 2-Step grace period successfully extended.`);
    console.log(`Account:  ${user.name || user.email} (${user.role})`);
    console.log(`Company:  ${user.tenant?.name || 'Platform Scope'}`);
    console.log(`Extended: ${days} day(s) from today.`);
    console.log(`Audit:    Logged action 2FA_GRACE_PERIOD_EXTENDED.`);
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('[ERROR] Failed to extend grace period:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
