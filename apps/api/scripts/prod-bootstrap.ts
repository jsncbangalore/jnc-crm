/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { extractSupabaseProjectRef } from './assertLocalDatabase';

const prisma = new PrismaClient();

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  let pwd = '';
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];
  for (let i = 4; i < 20; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

async function main() {
  console.log('========================================================================');
  console.log('CRM PRODUCTION DATABASE BOOTSTRAPPER');
  console.log('Target Database: Clean Production Supabase Instance');
  console.log('========================================================================\n');

  try {
    // 0. Guard: validate project reference against blocklist / allowlist
    const rawUrl = process.env.DATABASE_URL || '';
    const dbUrl = rawUrl.trim().replace(/^['\"]|['\"]$/g, '');
    const projectRef = extractSupabaseProjectRef(dbUrl);
    const blockedRefs = (process.env.BLOCKED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const allowedRefs = (process.env.ALLOWED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    if (projectRef) {
      if (blockedRefs.includes(projectRef)) {
        console.error(`\n[SECURITY REFUSAL] Target project reference "${projectRef}" is in BLOCKED_DB_PROJECT_REFS.`);
        process.exit(1);
      }
      if (!allowedRefs.includes(projectRef)) {
        console.error(`\n[SECURITY REFUSAL] Target project reference "${projectRef}" is not in ALLOWED_DB_PROJECT_REFS.`);
        process.exit(1);
      }
    }

    // 1. Guard: check if database has ANY existing Tenant records
    const tenantCount = await prisma.tenant.count();
    if (tenantCount > 0) {
      console.error(`\n[SECURITY REFUSAL] Database already contains ${tenantCount} tenant(s).`);
      console.error('prod:bootstrap is strictly forbidden on non-empty databases to protect existing data.');
      process.exit(1);
    }

    // 2. Validate configuration from environment
    const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const platformAdminEmail = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();

    if (!ownerEmail || !platformAdminEmail) {
      console.error('\n[CONFIG ERROR] OWNER_EMAIL and PLATFORM_ADMIN_EMAIL environment variables are required.');
      process.exit(1);
    }

    if (ownerEmail === platformAdminEmail) {
      console.error('\n[SECURITY ERROR] OWNER_EMAIL and PLATFORM_ADMIN_EMAIL must be different accounts.');
      process.exit(1);
    }

    const tenantName = (process.env.TENANT_NAME || 'Primary Organization').trim();
    const tenantCode = (process.env.TENANT_CODE || 'ORG').trim().toUpperCase();

    // 3. Generate high-entropy credentials
    const ownerPassword = generateSecurePassword();
    const platformPassword = generateSecurePassword();
    const ownerPasswordHash = await bcrypt.hash(ownerPassword, 12);
    const platformPasswordHash = await bcrypt.hash(platformPassword, 12);

    // 4. Generate cryptographically random webhook key & hash
    const plainWebhookKey = 'whsec_' + crypto.randomBytes(16).toString('hex');
    const webhookKeyHash = crypto.createHash('sha256').update(plainWebhookKey).digest('hex');

    // 5. Execute creation within a single atomic database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create internal tenant
      const primaryTenant = await tx.tenant.create({
        data: {
          code: tenantCode,
          name: tenantName,
          slug: tenantCode.toLowerCase(),
          isInternal: true,
          currency: process.env.CURRENCY || 'INR',
          status: 'active',
          webhookKeyHash,
        },
      });

      // Create owner tenant_admin
      const ownerUser = await tx.user.create({
        data: {
          email: ownerEmail,
          name: process.env.OWNER_NAME?.trim() || 'Owner',
          employeeCode: 'EMP-001',
          role: 'tenant_admin',
          passwordHash: ownerPasswordHash,
          mustResetPassword: true,
          tenantId: primaryTenant.id,
        },
      });

      // Create platform_super_admin
      const platformUser = await tx.user.create({
        data: {
          email: platformAdminEmail,
          name: process.env.PLATFORM_ADMIN_NAME?.trim() || 'Platform Administrator',
          employeeCode: 'ADM-PLATFORM-001',
          role: 'platform_super_admin',
          passwordHash: platformPasswordHash,
          mustResetPassword: true,
          tenantId: null,
        },
      });

      // Record immutable audit log
      await tx.auditLog.create({
        data: {
          action: 'PROD_BOOTSTRAP',
          entityName: 'Tenant',
          entityId: primaryTenant.id,
          tenantId: primaryTenant.id,
          actorId: ownerUser.id,
          actorName: ownerUser.name,
          afterState: JSON.stringify({
            message: 'Clean production database bootstrap complete.',
            tenantCode,
            ownerEmail,
            platformAdminEmail,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return { primaryTenant, ownerUser, platformUser };
    });

    // 6. Print credentials ONCE to console
    console.log('========================================================================');
    console.log('SUCCESS: PRODUCTION DATABASE INITIALIZATION COMPLETE');
    console.log('========================================================================\n');
    console.log(`Tenant Created:`);
    console.log(`  ID:          ${result.primaryTenant.id}`);
    console.log(`  Code:        ${result.primaryTenant.code}`);
    console.log(`  Name:        ${result.primaryTenant.name}`);
    console.log(`  Internal:    ${result.primaryTenant.isInternal}`);
    console.log(`  Webhook Key: ${plainWebhookKey}`);
    console.log(`\nOwner Account (Tenant Admin):`);
    console.log(`  Email:       ${ownerEmail}`);
    console.log(`  Password:    ${ownerPassword}`);
    console.log(`  Must Reset:  true`);
    console.log(`\nPlatform Super Admin Account:`);
    console.log(`  Email:       ${platformAdminEmail}`);
    console.log(`  Password:    ${platformPassword}`);
    console.log(`  Must Reset:  true`);
    console.log(`\n========================================================================`);
    console.log('IMPORTANT: Store these temporary passwords securely now.');
    console.log('They are never stored in plaintext and will not be displayed again.');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n[FATAL ERROR during prod:bootstrap]:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
