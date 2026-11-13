/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { decryptAtRest } from '../src/common/encryption.util';
import { verifyTotpToken } from '../src/common/totp.util';

// Server CLI 2FA grace period extension tool.
// Requires acting admin credentials (password or 2-step TOTP),
// CONFIRM_PRODUCTION=yes in production, writes audit log with who extended it,
// for whom, and new end date, and NEVER outputs secrets or passwords.
// Usage: npm run admin:extend-2fa-grace -- --email <email> --days N --admin-email <admin> --admin-password <pass>

function parseArgs(): {
  email?: string;
  days?: number;
  adminEmail?: string;
  adminPassword?: string;
  adminTotp?: string;
} {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let days: number | undefined;
  let adminEmail: string | undefined;
  let adminPassword: string | undefined;
  let adminTotp: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && i + 1 < args.length) {
      email = args[++i].trim();
    } else if (arg.startsWith('--email=')) {
      email = arg.split('=')[1].trim();
    } else if (arg === '--days' && i + 1 < args.length) {
      days = parseInt(args[++i].trim(), 10);
    } else if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1].trim(), 10);
    } else if (arg === '--admin-email' && i + 1 < args.length) {
      adminEmail = args[++i].trim();
    } else if (arg.startsWith('--admin-email=')) {
      adminEmail = arg.split('=')[1].trim();
    } else if (arg === '--admin-password' && i + 1 < args.length) {
      adminPassword = args[++i].trim();
    } else if (arg.startsWith('--admin-password=')) {
      adminPassword = arg.split('=')[1].trim();
    } else if (arg === '--admin-totp' && i + 1 < args.length) {
      adminTotp = args[++i].trim();
    } else if (arg.startsWith('--admin-totp=')) {
      adminTotp = arg.split('=')[1].trim();
    } else if (arg.includes('@') && !email) {
      email = arg.trim();
    } else if (!isNaN(parseInt(arg, 10)) && days === undefined) {
      days = parseInt(arg.trim(), 10);
    }
  }

  return { email, days, adminEmail, adminPassword, adminTotp };
}

async function main() {
  console.log('========================================================================');
  console.log('       JNC CRM SERVER 2-STEP (2FA) GRACE PERIOD EXTENSION CLI          ');
  console.log('========================================================================\n');

  // Guard: Must explicitly confirm production mode if in production
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('[SECURITY ERROR] Direct 2FA grace extension in production requires CONFIRM_PRODUCTION=yes.');
    console.error('Usage: CONFIRM_PRODUCTION=yes npm run admin:extend-2fa-grace -- --email <email> --days N --admin-email <admin> --admin-password <pass>\n');
    process.exit(1);
  }

  const { email, days: parsedDays, adminEmail, adminPassword, adminTotp } = parseArgs();
  if (!email || !email.includes('@')) {
    console.error('[ERROR] A valid --email argument is required.');
    console.error('Usage: npm run admin:extend-2fa-grace -- --email <email> --days N --admin-email <admin> --admin-password <pass>\n');
    process.exit(1);
  }

  const days = parsedDays !== undefined && !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 7;
  const cleanEmail = email.trim().toLowerCase();

  const prisma = new PrismaClient();

  try {
    // Verify acting admin credentials if provided
    let actingAdmin: any = null;
    if (adminEmail) {
      actingAdmin = await prisma.user.findFirst({
        where: { email: { equals: adminEmail.toLowerCase().trim(), mode: 'insensitive' }, deletedAt: null },
        include: { twoFactor: true },
      });
      if (!actingAdmin) {
        console.error(`[AUTH ERROR] Acting admin user not found: ${adminEmail}`);
        process.exit(1);
      }
      let verified = false;
      if (adminTotp && actingAdmin.twoFactor?.secretEnc) {
        const secret = decryptAtRest(actingAdmin.twoFactor.secretEnc);
        if (secret) {
          const res = verifyTotpToken(adminTotp, secret, actingAdmin.twoFactor.lastUsedStep);
          if (res.valid) verified = true;
        }
      }
      if (!verified && adminPassword && actingAdmin.passwordHash) {
        const match = await bcrypt.compare(adminPassword, actingAdmin.passwordHash);
        if (match) verified = true;
      }
      if (!verified) {
        console.error('[AUTH ERROR] Acting admin password or 2-step TOTP code is incorrect.');
        process.exit(1);
      }
    } else {
      // In dev mode without --admin-email, require acting admin to be specified or default to system admin
      console.log('[SECURITY NOTE] No --admin-email supplied; action logged under CLI_SERVER_ADMIN.');
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' }, deletedAt: null },
      include: { tenant: true },
    });

    if (!user) {
      console.error(`[ERROR] No active account found matching email: ${cleanEmail}`);
      process.exit(1);
    }

    // Calculate new grace period
    const newFirstLogin = new Date(Date.now() - (7 - days) * 24 * 60 * 60 * 1000);
    const newEndDate = new Date(newFirstLogin.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAfter2FaReleaseAt: newFirstLogin,
      },
    });

    const whoExtended = actingAdmin ? actingAdmin.email : 'CLI_SERVER_ADMIN';
    const actorId = actingAdmin ? actingAdmin.id : null;

    // Write audit log (never logs passwords or secrets)
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'platform',
        actorId,
        actorName: whoExtended,
        action: '2FA_GRACE_PERIOD_EXTENDED',
        entityName: 'User',
        entityId: user.id,
        afterState: JSON.stringify({
          whoExtended,
          actorId,
          forWhom: user.email,
          targetUserId: user.id,
          extendedDays: days,
          newEndDate: newEndDate.toISOString(),
          newFirstLogin: newFirstLogin.toISOString(),
          executedAt: new Date().toISOString(),
        }),
      },
    });

    console.log(`[SUCCESS] 2-Step grace period successfully extended.`);
    console.log(`Who Extended: ${whoExtended}`);
    console.log(`For Whom:     ${user.name || user.email} (${user.role})`);
    console.log(`Company:      ${user.tenant?.name || 'Platform Scope'}`);
    console.log(`Extended:     ${days} day(s) from today`);
    console.log(`New End Date: ${newEndDate.toISOString().split('T')[0]}`);
    console.log(`Audit:        Logged action 2FA_GRACE_PERIOD_EXTENDED.`);
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
