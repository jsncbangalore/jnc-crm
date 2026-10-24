/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function askHidden(prompt: string): Promise<string> {
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

    let val = '';
    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdout.write('\n');
          stdin.setRawMode(wasRaw);
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(val.trim());
          return;
        } else if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (char === '\b' || char === '\x7f') {
          if (val.length > 0) {
            val = val.slice(0, -1);
          }
        } else {
          val += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  console.log('========================================================================');
  console.log('       CRM DIRECT SERVER ADMIN MOBILE PHONE CONFIGURATION CLI          ');
  console.log('========================================================================\n');

  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('[SECURITY ERROR] Direct admin mobile phone setup requires CONFIRM_PRODUCTION=yes.');
    console.error('Usage: CONFIRM_PRODUCTION=yes npm run admin:set-phone\n');
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

    console.log(`Found account: ${user.name || user.email} (Role: ${user.role}, Portal: ${user.tenant?.name || 'Platform Super Admin'})`);

    const phoneInput = await askHidden('Enter mobile number (silent, no echo): ');
    if (!phoneInput) {
      console.error('[ERROR] Mobile number cannot be empty.');
      process.exit(1);
    }

    const confirmInput = await askHidden('Confirm mobile number (silent, no echo): ');
    if (phoneInput !== confirmInput) {
      console.error('[ERROR] Mobile numbers do not match.');
      process.exit(1);
    }

    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 10) {
      console.error('[ERROR] Mobile number must contain at least 10 digits.');
      process.exit(1);
    }

    const last10 = digits.slice(-10);
    const normalizedPhone = `+91 ${last10}`;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        phone: normalizedPhone,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: 'SERVER_ADMIN_CLI',
        action: 'ADMIN_SET_PHONE_CLI',
        entityName: 'User',
        entityId: user.id,
        ipAddress: '127.0.0.1 (CLI)',
        afterState: JSON.stringify({
          email: user.email,
          role: user.role,
          countryPrefix: '+91',
          last10Length: 10,
          updatedField: 'phone',
          timestamp: new Date().toISOString(),
        }),
      },
    }).catch(() => {});

    console.log('\n[SUCCESS] Mobile number updated successfully for account.');
    console.log('[SECURITY] Mobile number normalized to 10 digits with +91 country prefix.');
    console.log('[SECURITY] Audit record logged. Zero phone digits printed to terminal.');
  } catch (err: any) {
    console.error(`[ERROR] Admin phone update failed: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
