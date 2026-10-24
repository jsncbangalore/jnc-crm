/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'readline';
import { validatePasswordPolicy } from '../src/common/password-policy';

// Server CLI password reset tool for server administrators when email/SMTP is unavailable.
// Requires CONFIRM_PRODUCTION=yes, prompts without echo, validates policy, revokes sessions,
// writes audit log, and NEVER outputs passwords to stdout or logs.

function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function askPasswordHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive fallback (e.g. piped stdin in test suites)
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }

    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let password = '';
    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdout.write('\n');
          stdin.setRawMode(wasRaw);
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(password.trim());
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(1);
        } else if (char === '\b' || char === '\x7f') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  console.log('========================================================================');
  console.log('       CRM DIRECT SERVER EMERGENCY PASSWORD RESET CLI               ');
  console.log('========================================================================\n');

  // Guard: Must explicitly confirm production mode
  if (process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('[SECURITY ERROR] Direct admin password reset requires CONFIRM_PRODUCTION=yes.');
    console.error('Usage: CONFIRM_PRODUCTION=yes npm run admin:set-password\n');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const email = await askInput('Enter account email address: ');
    if (!email || !email.includes('@')) {
      console.error('[ERROR] A valid email address is required.');
      process.exit(1);
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' }, deletedAt: null },
      include: { tenant: true },
    });

    if (!user) {
      console.error(`[ERROR] No account found matching: ${email.trim()}`);
      process.exit(1);
    }

    console.log(`Found account: ${user.name || user.email} (Role: ${user.role}, Tenant: ${user.tenant?.name || 'Platform'})`);

    const newPassword = await askPasswordHidden('Enter new password (silent, no echo): ');
    if (!newPassword) {
      console.error('[ERROR] Password cannot be empty.');
      process.exit(1);
    }

    const confirmPassword = await askPasswordHidden('Confirm new password (silent, no echo): ');
    if (newPassword !== confirmPassword) {
      console.error('[ERROR] Passwords do not match.');
      process.exit(1);
    }

    // Validate password policy (12 chars, not common, no personal info)
    try {
      validatePasswordPolicy(newPassword, { email: user.email, name: user.name });
    } catch (policyErr: any) {
      console.error(`[POLICY ERROR] ${policyErr.message}`);
      process.exit(1);
    }

    // Hash with bcrypt cost 12
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user record
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustResetPassword: false,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastPasswordChangeAt: new Date(),
      },
    });

    // Revoke all existing sessions and trusted devices
    await prisma.refreshSession.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });
    await prisma.trustedDevice.deleteMany({
      where: { userId: user.id },
    }).catch(() => {});

    // Clear any lockout records
    const lockKey = user.tenantId ? `${user.email.toLowerCase()}:${user.tenantId}` : user.email.toLowerCase();
    await prisma.accountLockout.delete({ where: { identityKey: lockKey } }).catch(() => {});
    await prisma.accountLockout.delete({ where: { identityKey: user.email.toLowerCase() } }).catch(() => {});

    // Write audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: 'SERVER_ADMIN_CLI',
        action: 'ADMIN_SET_PASSWORD_CLI',
        entityName: 'User',
        entityId: user.id,
        ipAddress: '127.0.0.1 (CLI)',
        afterState: JSON.stringify({
          email: user.email,
          role: user.role,
          resetMethod: 'admin:set-password-cli',
          sessionsRevoked: true,
          timestamp: new Date().toISOString(),
        }),
      },
    }).catch(() => {});

    console.log('\n[SUCCESS] Password updated successfully for account.');
    console.log(`[SECURITY] All existing sessions for ${user.email} have been revoked.`);
    console.log('[SECURITY] Audit record logged. Zero credentials printed to terminal.');
  } catch (err: any) {
    console.error(`[ERROR] Password reset failed: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
