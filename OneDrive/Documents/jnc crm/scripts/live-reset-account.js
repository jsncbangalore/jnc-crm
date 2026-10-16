/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// ─── 1. FOLDER GUARD ─────────────────────────────────────────────────────────
function enforceFolderGuard() {
  const currentPath = process.cwd();
  const scriptDir = __dirname;
  const prohibited = [/onedrive/i, /&/, /jnc crm/i];

  for (const pattern of prohibited) {
    if (pattern.test(currentPath) || pattern.test(scriptDir)) {
      console.error(`\n========================================================================`);
      console.error(`❌ FOLDER GUARD REFUSAL ERROR: Prohibited path detected.`);
      console.error(`Current directory: "${currentPath}"`);
      console.error(`Script directory:  "${scriptDir}"`);
      console.error(`Prohibited pattern: ${pattern}`);
      console.error(`Execution is strictly required inside 'C:\\dev\\jnc-crm'. Aborting immediately.`);
      console.error(`========================================================================\n`);
      process.exit(1);
    }
  }
}

enforceFolderGuard();

// ─── 2. SECRETS & PROJECT REF VALIDATION ────────────────────────────────────
const secrets = {};
['C:\\dev\\jnc-secrets\\live.env', 'C:\\dev\\jnc-secrets\\hostinger.env'].forEach(secretsPath => {
  if (fs.existsSync(secretsPath)) {
    const envContent = fs.readFileSync(secretsPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx !== -1) {
        let k = line.substring(0, idx).trim();
        let v = line.substring(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.substring(1, v.length - 1);
        }
        if (!secrets[k]) secrets[k] = v;
      }
    });
  }
});

const EXPECTED_PROJECT_REF = process.env.TEST_NEW_PROJECT_REF || secrets.NEW_PROJECT_REF || 'aybysdzuwwtqhnzhgiwp';
const OLD_PROJECT_REF = secrets.OLD_PROJECT_REF || 'hbzlelktcfagwvmyusvw';
const directUrl = process.env.TEST_DIRECT_URL || secrets.DIRECT_URL || secrets.DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;

// Parse CLI Arguments
const args = process.argv.slice(2);
let roleArg = null;
let isDryRun = false;
let isRehearse = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--role' && args[i + 1]) {
    roleArg = args[++i].toLowerCase();
  } else if (args[i].startsWith('--role=')) {
    roleArg = args[i].split('=')[1].toLowerCase();
  } else if (args[i] === '--dry-run') {
    isDryRun = true;
  } else if (args[i] === '--rehearse') {
    isRehearse = true;
  }
}

if (!roleArg || (roleArg !== 'owner' && roleArg !== 'platform')) {
  console.error('[LIVE RESET FAIL] Missing or invalid --role argument.');
  console.error('Usage: node scripts/live-reset-account.js --role owner|platform [--dry-run] [--rehearse]');
  process.exit(1);
}

if (!directUrl) {
  console.error('[LIVE RESET FAIL] DIRECT_URL missing in environment/live.env');
  process.exit(1);
}

// Strictly parse project ref from connection string username
let actualRef;
try {
  const parsedUrl = new URL(directUrl);
  const username = parsedUrl.username || '';
  const matchUser = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);
  const matchHost = parsedUrl.hostname.match(/^db\.([a-z0-9_-]+)\.supabase\.co$/i);

  actualRef = (matchUser && matchUser[1]) ? matchUser[1] : (matchHost && matchHost[1] ? matchHost[1] : null);

  if (!actualRef) {
    console.error(`[PROJECT REF REFUSAL] Connection string username "${username}" or host "${parsedUrl.hostname}" has no project ref. Execution refused.`);
    process.exit(1);
  }

  if (actualRef === OLD_PROJECT_REF) {
    console.error(`[PROJECT REF REFUSAL] Connection string username has OLD_PROJECT_REF "${actualRef}". Refusing execution on old database.`);
    process.exit(1);
  }

  if (actualRef !== EXPECTED_PROJECT_REF) {
    console.error(`[PROJECT REF REFUSAL] Connection string project ref "${actualRef}" does not match expected NEW_PROJECT_REF "${EXPECTED_PROJECT_REF}". Execution refused.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[PROJECT REF REFUSAL] Connection string URL invalid: ${err.message}`);
  process.exit(1);
}

// Override process.env
process.env.DATABASE_URL = directUrl;
process.env.DIRECT_URL = directUrl;

const dbHost = directUrl.split('@').pop().split('/')[0];

function maskEmail(email) {
  if (!email) return 'none';
  return email.replace(/^(..)(.*)(@.*)$/, '$1***$3');
}

async function runAccountReset() {
  const timestamp = new Date().toISOString();
  console.log(`GENERATED BY SCRIPT live-reset-account.js AT ${timestamp}`);
  console.log(`Database project ${actualRef} @ ${dbHost}`);
  console.log(`Mode: ${isRehearse ? 'REHEARSAL (FULL TRANSACTION WRITE - ROLLED BACK)' : isDryRun ? 'DRY RUN (READ ONLY)' : 'LIVE EXECUTION'}`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: directUrl,
      },
    },
  });

  const targetRole = roleArg === 'owner' ? 'tenant_admin' : 'platform_super_admin';

  try {
    await prisma.$connect();

    const user = await prisma.user.findFirst({
      where: roleArg === 'owner'
        ? { OR: [{ role: 'tenant_admin' }, { role: 'admin' }, { email: 'santhoshs0815@gmail.com' }, { employeeCode: 'JNC-SA-001' }, { employeeCode: 'EMP-ADM-001' }], deletedAt: null }
        : { OR: [{ role: 'platform_super_admin' }, { email: 'jayarajjnc@gmail.com' }, { email: 'jsnccrm@gmail.com' }, { employeeCode: 'SYS-SUP-001' }], deletedAt: null },
      include: { tenant: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!user) {
      console.error(`[LIVE RESET FAIL] Target user matching role "${targetRole}" not found in database.`);
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`\nMatched Target Account:`);
    console.log(`  User ID:       ${user.id}`);
    console.log(`  Employee Code: ${user.employeeCode}`);
    console.log(`  Role:          ${user.role}`);
    console.log(`  Masked Email:  ${maskEmail(user.email)}`);
    console.log(`  Tenant:        ${user.tenant ? user.tenant.name + ' (' + user.tenant.code + ')' : 'Platform (Global)'}`);

    if (isDryRun) {
      console.log('\n[DRY RUN RESULT] Account match validated. Zero database modifications executed.');
      await prisma.$disconnect();
      return;
    }

    const newPassword = process.env.LIVE_NEW_PASSWORD || secrets.LIVE_NEW_PASSWORD || crypto.randomBytes(12).toString('base64url');
    // Bcrypt cost factor 12
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const identityKeys = [
      user.email.toLowerCase(),
      user.employeeCode ? user.employeeCode.toUpperCase() : null,
      user.id,
      `USER:${user.id}`,
      `EMAIL:${user.email.toLowerCase()}`,
    ].filter(Boolean);

    let committed = false;

    try {
      await prisma.$transaction(async (tx) => {
        const beforeState = JSON.stringify({
          id: user.id,
          email: user.email,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
          failedLoginAttempts: user.failedLoginAttempts,
          lockoutUntil: user.lockoutUntil,
          tokenVersion: user.tokenVersion,
          isActive: user.isActive,
        });

        // 1. Update User (cost 12 hash, mustResetPassword=true, failedLoginAttempts=0, lockoutUntil=null, tokenVersion=tokenVersion+1, isActive=true)
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustResetPassword: true,
            failedLoginAttempts: 0,
            lockoutUntil: null,
            tokenVersion: { increment: 1 },
            isActive: true,
          },
        });
        console.log(`\n[STATEMENT 1 UPDATE User] Affected 1 row (ID: ${updatedUser.id})`);
        console.log(`  - passwordHash: set (bcrypt cost 12)`);
        console.log(`  - mustResetPassword: true`);
        console.log(`  - failedLoginAttempts: 0`);
        console.log(`  - lockoutUntil: null`);
        console.log(`  - tokenVersion: ${user.tokenVersion} -> ${updatedUser.tokenVersion}`);
        console.log(`  - isActive: true`);

        // 2. Delete AccountLockout by identityKey
        const lockoutDel = await tx.accountLockout.deleteMany({
          where: { identityKey: { in: identityKeys } },
        });
        console.log(`[STATEMENT 2 DELETE AccountLockout] Affected ${lockoutDel.count} row(s) matching identityKeys (${identityKeys.join(', ')})`);

        // 3. Insert AuditLog
        let tenantId = user.tenantId;
        if (!tenantId) {
          const defaultTenant = await tx.tenant.findFirst({ select: { id: true } });
          tenantId = defaultTenant ? defaultTenant.id : 'default-tenant-id';
        }

        const afterState = JSON.stringify({
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          mustResetPassword: updatedUser.mustResetPassword,
          failedLoginAttempts: updatedUser.failedLoginAttempts,
          lockoutUntil: updatedUser.lockoutUntil,
          tokenVersion: updatedUser.tokenVersion,
          isActive: updatedUser.isActive,
        });

        const auditLog = await tx.auditLog.create({
          data: {
            tenantId,
            actorId: user.id,
            actorName: user.name || user.email,
            action: 'LIVE_ACCOUNT_PASSWORD_RESET',
            entityName: 'User',
            entityId: user.id,
            beforeState,
            afterState,
            ipAddress: '127.0.0.1',
          },
        });
        console.log(`[STATEMENT 3 INSERT AuditLog] Affected 1 row (AuditLog ID: ${auditLog.id}, Action: ${auditLog.action})`);

        if (isRehearse) {
          console.log(`\n[REHEARSAL RESULT] Single-transaction write completed successfully.`);
          console.log(`[REHEARSAL RESULT] Triggering transaction ROLLBACK (no database modifications persisted).`);
          throw new Error('REHEARSAL_ROLLBACK_INTENTIONAL');
        }

        committed = true;
      });
    } catch (err) {
      if (err.message === 'REHEARSAL_ROLLBACK_INTENTIONAL') {
        console.log(`\n✅ REHEARSAL SUCCESSFUL: Transaction safely rolled back. Database remains untouched.`);
      } else {
        throw err;
      }
    }

    if (committed) {
      console.log(`\n✅ LIVE ACCOUNT PASSWORD RESET SUCCESSFUL!`);
      console.log(`  Account ID: ${user.id}`);
      console.log(`  Role:       ${user.role}`);
      console.log(`  ------------------------------------------------------------------------`);
      console.log(`  ONE-TIME NEW PASSWORD (PRINTED ONCE ONLY AFTER COMMIT):`);
      console.log(`  Password:   ${newPassword}`);
      console.log(`  ------------------------------------------------------------------------`);
    }

  } catch (error) {
    console.error(`❌ Operation failed:`, error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

runAccountReset();
