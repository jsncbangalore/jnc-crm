/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const PROD_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

function validateStagingEnvironment() {
  // 1. Refuse unless NODE_ENV === 'staging'
  if (process.env.NODE_ENV !== 'staging') {
    console.error(
      '\n[SECURITY ERROR] seed-staging refused to run: NODE_ENV must be "staging". Current:',
      process.env.NODE_ENV,
    );
    process.exit(1);
  }

  // 2. Validate DATABASE_URL
  const rawUrl = process.env.DATABASE_URL || '';
  const dbUrl = rawUrl.trim().replace(/^['\"]|['\"]$/g, '');
  if (!dbUrl) {
    console.error('\n[SECURITY ERROR] seed-staging: DATABASE_URL is not set.');
    process.exit(1);
  }

  let hostname: string;
  try {
    hostname = new URL(dbUrl).hostname.toLowerCase();
  } catch (e: any) {
    console.error('\n[SECURITY ERROR] seed-staging: Invalid DATABASE_URL:', e.message);
    process.exit(1);
  }

  // 3. Strict rejection of live Supabase host
  if (hostname === PROD_HOST.toLowerCase() || hostname.endsWith('supabase.com')) {
    console.error(
      `\n[SECURITY ERROR] seed-staging refused to run on live Supabase host: ${hostname}. Live Supabase is strictly forbidden.`,
    );
    process.exit(1);
  }

  // 4. Refuse unless the host is in ALLOWED_DB_HOSTS
  const allowedHosts = (process.env.ALLOWED_DB_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedHosts.includes(hostname)) {
    console.error(
      `\n[SECURITY ERROR] seed-staging refused to run on database host "${hostname}". Host is not present in ALLOWED_DB_HOSTS: [${allowedHosts.join(', ')}].`,
    );
    process.exit(1);
  }

  console.log(`[OK] Staging environment verified (Host: ${hostname}, NODE_ENV: staging)`);
}

function generateSecureRandomPassword(): string {
  const token = crypto.randomBytes(9).toString('base64url');
  return `Jnc#Stg${token}!9`;
}

async function main() {
  validateStagingEnvironment();

  const prisma = new PrismaClient();

  try {
    console.log('\n========================================================================');
    console.log('[STAGING SEED] Seeding staging database with initial companies & users...');
    console.log('========================================================================\n');

    // 1. Create JNC Internal Company
    const jncTenant = await prisma.tenant.upsert({
      where: { code: 'JNC' },
      update: {
        name: 'JNC Network & Communication',
        isInternal: true,
        status: 'active',
      },
      create: {
        code: 'JNC',
        slug: 'jnc',
        name: 'JNC Network & Communication',
        isInternal: true,
        status: 'active',
      },
    });
    console.log(`[OK] Internal Tenant verified: [${jncTenant.code}] ${jncTenant.name}`);

    // 2. Define users to seed with random passwords and mustResetPassword = true
    const userDefinitions = [
      {
        role: 'platform_super_admin',
        name: 'Staging Platform Super Admin',
        email: 'staging.superadmin@jsnc.co.in',
        employeeCode: 'PSA-STG-001',
        tenantId: null,
      },
      {
        role: 'tenant_admin',
        name: 'Boss Tenant Admin',
        email: 'staging.boss@jsnc.co.in',
        employeeCode: 'TA-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'employee',
        name: 'Staging Employee',
        email: 'staging.employee@jsnc.co.in',
        employeeCode: 'EMP-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'sub_admin',
        name: 'Staging Sub Admin',
        email: 'staging.subadmin@jsnc.co.in',
        employeeCode: 'SUB-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'store_manager',
        name: 'Staging Store Manager',
        email: 'staging.storemanager@jsnc.co.in',
        employeeCode: 'STM-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'project_manager',
        name: 'Staging Project Manager',
        email: 'staging.projectmanager@jsnc.co.in',
        employeeCode: 'PJM-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'developer_lead',
        name: 'Staging Developer Lead',
        email: 'staging.devlead@jsnc.co.in',
        employeeCode: 'DVL-STG-001',
        tenantId: jncTenant.id,
      },
      {
        role: 'developer',
        name: 'Staging Developer',
        email: 'staging.developer@jsnc.co.in',
        employeeCode: 'DEV-STG-001',
        tenantId: jncTenant.id,
      },
    ];

    const generatedCredentials: Array<{
      role: string;
      email: string;
      password: string;
      employeeCode: string;
      tenant: string;
    }> = [];

    for (const def of userDefinitions) {
      const plainPassword = generateSecureRandomPassword();
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      let existingUser: any = null;
      if (def.tenantId) {
        existingUser = await prisma.user.findUnique({
          where: { tenantId_email: { tenantId: def.tenantId, email: def.email } },
        });
      } else {
        existingUser = await prisma.user.findFirst({
          where: { email: def.email, tenantId: null },
        });
      }

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: def.name,
            role: def.role,
            tenantId: def.tenantId,
            employeeCode: def.employeeCode,
            passwordHash,
            isActive: true,
            mustResetPassword: true,
            deletedAt: null,
          },
        });
      } else {
        await prisma.user.create({
          data: {
            email: def.email,
            name: def.name,
            role: def.role,
            tenantId: def.tenantId,
            employeeCode: def.employeeCode,
            passwordHash,
            isActive: true,
            mustResetPassword: true,
          },
        });
      }

      generatedCredentials.push({
        role: def.role,
        email: def.email,
        password: plainPassword,
        employeeCode: def.employeeCode,
        tenant: def.tenantId ? 'JNC' : 'Platform Scope',
      });
    }

    // 3. Create 5 fake companies clearly named "TEST"
    const fakeCompanyNames = [
      'TEST Alpha Electronics Pvt Ltd',
      'TEST Beta Industrial Components',
      'TEST Gamma Sound Systems',
      'TEST Delta Telecommunications',
      'TEST Epsilon Robotics & Controls',
    ];

    const createdCompanies: any[] = [];
    for (let i = 0; i < fakeCompanyNames.length; i++) {
      const comp = await prisma.company.create({
        data: {
          tenantId: jncTenant.id,
          name: fakeCompanyNames[i],
          gstin: `29AAACT${1000 + i}A1Z${i}`,
          industry: 'Electronics & Audio Systems',
          city: 'Bangalore',
          state: 'Karnataka',
          billingEmail: `billing.test${i + 1}@example.com`,
        },
      });
      createdCompanies.push(comp);
    }
    console.log(`[OK] Created ${createdCompanies.length} fake TEST companies`);

    // 4. Create 10 fake leads clearly named "TEST"
    const fakeLeadTitles = [
      'TEST Lead - PAS Main Controller Batch Order',
      'TEST Lead - Industrial Amplifier Upgrade',
      'TEST Lead - Railway Station Audio Overhaul',
      'TEST Lead - Factory Intercom Rig System',
      'TEST Lead - Commercial Office Audio Grid',
      'TEST Lead - Microcontroller PCB Sourcing',
      'TEST Lead - Smart Public Address Units',
      'TEST Lead - High-Power Horn Speaker Rig',
      'TEST Lead - Airport Gate Announcement Unit',
      'TEST Lead - School Campus Bell & Broadcast',
    ];

    const createdLeads: any[] = [];
    for (let i = 0; i < fakeLeadTitles.length; i++) {
      const company = createdCompanies[i % createdCompanies.length];
      const lead = await prisma.lead.create({
        data: {
          tenantId: jncTenant.id,
          leadNumber: `LEAD-TEST-${String(i + 1).padStart(3, '0')}`,
          customerName: `${fakeLeadTitles[i]} (Contact ${i + 1})`,
          customerPhone: `+9198000${String(i).padStart(5, '0')}`,
          customerEmail: `lead.test${i + 1}@example.com`,
          companyId: company.id,
          status: i % 2 === 0 ? 'new' : 'contacted',
          source: 'manual',
          productCategory: 'Public Address Systems',
          productName: fakeLeadTitles[i],
        },
      });
      createdLeads.push(lead);
    }
    console.log(`[OK] Created ${createdLeads.length} fake TEST leads`);

    // 5. Create 3 fake quotations clearly named "TEST"
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + 30);

    for (let i = 0; i < 3; i++) {
      const lead = createdLeads[i];
      await prisma.quotation.create({
        data: {
          tenantId: jncTenant.id,
          quoteNumber: `Q-TEST-${String(i + 1).padStart(4, '0')}`,
          leadId: lead.id,
          status: 'draft',
          subtotal: 50000 * (i + 1),
          taxRate: 18.0,
          taxAmount: 50000 * (i + 1) * 0.18,
          totalAmount: 50000 * (i + 1) * 1.18,
          validUntil: validUntilDate,
          notes: `TEST Quotation for ${lead.customerName}`,
          terms: 'Standard Staging Test Quotation Terms',
        },
      });
    }
    console.log('[OK] Created 3 fake TEST quotations');

    // 6. Print credentials ONCE to console — never written to disk
    console.log('\n========================================================================');
    console.log('STAGING SEED COMPLETE — ONE-TIME CREDENTIALS (NEVER WRITTEN TO DISK)');
    console.log('========================================================================');
    for (const cred of generatedCredentials) {
      console.log(`[ROLE] ${cred.role}`);
      console.log(`  Email:         ${cred.email}`);
      console.log(`  Password:      ${cred.password}`);
      console.log(`  Employee Code: ${cred.employeeCode}`);
      console.log(`  Workspace:     ${cred.tenant}`);
      console.log(`  mustResetPass: true`);
      console.log('------------------------------------------------------------------------');
    }
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('[!] Failed to seed staging database:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
