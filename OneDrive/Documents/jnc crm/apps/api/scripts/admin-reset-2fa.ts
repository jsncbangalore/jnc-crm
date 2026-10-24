/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

// Server CLI 2FA reset tool for platform owner when authenticators are lost.
// Requires CONFIRM_PRODUCTION=yes, asks email without echo, writes audit log,
// revokes trusted devices, and NEVER outputs secrets or codes.

function askInputHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
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

    let input = '';
    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdout.write('\n');
          stdin.setRawMode(wasRaw);
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(input.trim());
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(1);
        } else if (char === '\b' || char === '\x7f') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  console.log('========================================================================');
  console.log('       CRM DIRECT SERVER EMERGENCY 2-STEP (2FA) RESET CLI           ');
  console.log('========================================================================\n');

  // Guard: Must explicitly confirm production mode
  if (process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('[SECURITY ERROR] Direct admin 2FA reset requires CONFIRM_PRODUCTION=yes.');
    console.error('Usage: CONFIRM_PRODUCTION=yes npm run admin:reset-2fa\n');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const email = await askInputHidden('Enter account email address (silent, no echo): ');
    if (!email || !email.includes('@')) {
      console.error('[ERROR] A valid email address is required.');
      process.exit(1);
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' }, deletedAt: null },
      include: { tenant: true, twoFactor: true },
    });

    if (!user) {
      console.error(`[ERROR] No account found matching: ${cleanEmail}`);
      process.exit(1);
    }

    console.log(`Found account: ${user.name || user.email} (Role: ${user.role}, Tenant: ${user.tenant?.name || 'Platform'})`);

    // Reset 2FA records
    await prisma.userTwoFactor.deleteMany({
      where: { userId: user.id },
    });

    // Revoke all trusted devices
    await prisma.trustedDevice.deleteMany({
      where: { userId: user.id },
    });

    // Revoke all refresh sessions and increment tokenVersion
    await prisma.refreshSession.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'platform',
        actorId: 'server-cli',
        actorName: 'Server CLI Admin',
        action: 'ADMIN_EMERGENCY_2FA_RESET',
        entityName: 'User',
        entityId: user.id,
        ipAddress: '127.0.0.1',
        afterState: JSON.stringify({
          message: 'Two-step verification emergency reset via direct server CLI',
          resetAt: new Date().toISOString(),
          account: user.email,
        }),
      },
    });

    // Send security notification email via background outbox
    await prisma.emailOutbox.create({
      data: {
        to: user.email,
        tenantId: user.tenantId,
        subject: 'Security Alert: Two-step verification was reset by server administrator',
        text: `Hello ${user.name || 'there'},\n\nTwo-step verification on your CRM account was reset via emergency server administration.\n\nAll existing sessions and trusted devices have been signed out. Please sign in to re-enroll two-step verification immediately.`,
        status: 'pending',
        isDecoy: false,
      },
    });

    console.log('[SUCCESS] Two-step verification has been reset successfully.');
    console.log('[SECURITY] All active sessions, tokens, and trusted devices have been revoked.');
    console.log('[SECURITY] Audit log recorded and notification email enqueued.\n');
  } catch (err: any) {
    console.error(`[FATAL ERROR] 2FA reset failed: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
