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

const secretsPath = 'C:\\dev\\jnc-secrets\\live.env';
if (!fs.existsSync(secretsPath)) {
  console.error('[BOOTSTRAP FAIL] Missing secrets file C:\\dev\\jnc-secrets\\live.env');
  process.exit(1);
}

const envContent = fs.readFileSync(secretsPath, 'utf8');
const secrets = {};
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
    secrets[k] = v;
  }
});

const EXPECTED_PROJECT_REF = process.env.TEST_NEW_PROJECT_REF || secrets.NEW_PROJECT_REF || 'aybysdzuwwtqhnzhgiwp';
const OLD_PROJECT_REF = secrets.OLD_PROJECT_REF || 'hbzlelktcfagwvmyusvw';
const databaseUrl = process.env.TEST_DATABASE_URL || secrets.DATABASE_URL;

if (!databaseUrl) {
  console.error('[BOOTSTRAP FAIL] DATABASE_URL missing in environment/live.env');
  process.exit(1);
}

// Strictly parse project ref from connection string username
let actualRef;
try {
  const parsedUrl = new URL(databaseUrl);
  const username = parsedUrl.username || '';
  const match = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);

  if (!match || !match[1]) {
    console.error(`[PROJECT REF REFUSAL] Connection string username "${username}" has no project ref. Format must be "postgres.<ref>". Execution refused.`);
    process.exit(1);
  }

  actualRef = match[1];

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

function generateSecurePassword(length = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

async function runBootstrap() {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$connect();

    const superAdminEmail = 'platform@jsnc.co.in'.trim().toLowerCase();
    const tenantAdminEmail = 'tenantadmin@jsnc.co.in'.trim().toLowerCase();

    // Check existing users
    const existingUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true },
    });

    if (existingUsers.length > 0) {
      const isIdempotent = existingUsers.length === 2 &&
        existingUsers.some(u => u.email === superAdminEmail && u.role === 'platform_super_admin') &&
        existingUsers.some(u => u.email === tenantAdminEmail && u.role === 'tenant_admin');

      if (isIdempotent) {
        console.log('========================================================================');
        console.log(`BOOTSTRAP IDEMPOTENT OK: Owner accounts already bootstrapped cleanly (Ref: ${actualRef}).`);
        console.log('========================================================================');
        await prisma.$disconnect();
        return;
      } else {
        console.error(`[BOOTSTRAP FAIL] Database already contains ${existingUsers.length} user(s). Bootstrapper refuses to run on non-empty user tables.`);
        process.exit(1);
      }
    }

    const platformPassword = generateSecurePassword(20);
    const tenantPassword = generateSecurePassword(20);

    const platformHash = await bcrypt.hash(platformPassword, 12);
    const tenantHash = await bcrypt.hash(tenantPassword, 12);

    await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: platformHash,
        name: 'Platform Super Admin',
        role: 'platform_super_admin',
        employeeCode: 'SYS-SUP-001',
        mustResetPassword: true,
        tenantId: null,
      },
    });

    const jncTenant = await prisma.tenant.create({
      data: {
        code: 'JNC',
        name: 'JNC Networking & Communications',
        slug: 'jnc',
        status: 'active',
        planTier: 'enterprise',
        isInternal: true,
        maxUsers: 100,
      },
    });

    await prisma.user.create({
      data: {
        tenantId: jncTenant.id,
        email: tenantAdminEmail,
        passwordHash: tenantHash,
        name: 'JNC Administrator',
        role: 'tenant_admin',
        employeeCode: 'EMP-ADM-001',
        mustResetPassword: true,
      },
    });

    console.log('========================================================================');
    console.log(`JNC-CRM OWNER ACCOUNT BOOTSTRAP COMPLETED SUCCESSFULLY (Ref: ${actualRef})`);
    console.log('========================================================================');
    console.log('ONE-TIME INITIAL CREDENTIALS (COPY & SAVE SAFELY NOW, NOT SAVED TO DISK):');
    console.log('------------------------------------------------------------------------');
    console.log(`1. PLATFORM SUPER ADMIN:`);
    console.log(`   Email:      ${superAdminEmail}`);
    console.log(`   Password:   ${platformPassword}`);
    console.log(`   Role:       platform_super_admin (tenantId: null)`);
    console.log('------------------------------------------------------------------------');
    console.log(`2. TENANT ADMIN (JNC):`);
    console.log(`   Company:    JNC Networking & Communications (Code: JNC)`);
    console.log(`   Email:      ${tenantAdminEmail}`);
    console.log(`   Password:   ${tenantPassword}`);
    console.log(`   Role:       tenant_admin`);
    console.log('========================================================================');

    await prisma.$disconnect();
  } catch (err) {
    console.error(`[BOOTSTRAP FAIL] Execution error: ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runBootstrap();
