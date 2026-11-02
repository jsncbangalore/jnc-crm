const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const { Writable } = require('stream');

const prisma = new PrismaClient();

function askPasswordHidden(query) {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(query);
    muted = true;
    rl.question('', (password) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(password.trim());
    });
  });
}

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  const ownerName = process.env.OWNER_NAME?.trim() || 'System Owner';
  const ownerPhone = process.env.OWNER_PHONE?.trim() || '';

  if (!ownerEmail) {
    console.error('[ERROR] Error: OWNER_EMAIL environment variable is required to seed the owner account.');
    process.exit(1);
  }

  let password = process.env.OWNER_PASSWORD?.trim();
  if (!password) {
    if (process.stdin.isTTY) {
      password = await askPasswordHidden('Enter Owner Password: ');
    } else {
      console.error('[ERROR] Error: OWNER_PASSWORD environment variable is required in non-interactive mode.');
      process.exit(1);
    }
  }

  if (!password || password.length < 8) {
    console.error('[ERROR] Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  console.log('[1/3] Purging existing database tables...');

  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "Tenant",
        "AccountLockout"
      CASCADE;
    `);
  } catch (err) {
    const models = [
      'stockItem', 'stockMovement', 'stockTransfer', 'locationBin', 'warehouse',
      'sku', 'product', 'supplier', 'invoiceLine', 'invoice', 'shipment', 'order',
      'quotation', 'leadActivity', 'leadShare', 'lead', 'contact', 'company',
      'auditLog', 'messageLog', 'paymentRecord', 'customObjectRecord', 'customField',
      'customObject', 'projectDailyLog', 'projectStockPosition', 'projectAssignment',
      'project', 'automationStep', 'automationRule', 'mailAccount', 'accountLockout',
      'user', 'team', 'tenant'
    ];
    for (const m of models) {
      if (prisma[m]) {
        try { await prisma[m].deleteMany({}); } catch (e) {}
      }
    }
  }

  console.log('[2/3] Creating Primary Organization...');
  const tenantCode = process.env.OWNER_TENANT_CODE || 'ORG-001';
  const tenantName = process.env.OWNER_TENANT_NAME || (process.env.PRODUCT_NAME ? `${process.env.PRODUCT_NAME} Primary Tenant` : 'Primary Tenant');
  const tenantSlug = process.env.OWNER_TENANT_SLUG || 'primary';

  const masterOrg = await prisma.tenant.create({
    data: {
      id: 'default-tenant-id',
      code: tenantCode,
      name: tenantName,
      slug: tenantSlug,
      status: 'active',
      planTier: 'enterprise',
      maxUsers: 100,
      currency: process.env.CURRENCY || 'INR',
      invoicePrefix: process.env.INVOICE_PREFIX || 'INV',
    },
  });

  console.log('[3/3] Creating Master Super Admin Owner Account...');
  const ownerPasswordHash = await bcrypt.hash(password, 10);

  const ownerUser = await prisma.user.create({
    data: {
      tenantId: masterOrg.id,
      employeeCode: 'EMP-001',
      name: ownerName,
      email: ownerEmail,
      role: 'super_admin',
      phone: ownerPhone,
      isActive: true,
      mustResetPassword: false,
      passwordHash: ownerPasswordHash,
    },
  });

  // Seed default warehouse hub
  await prisma.warehouse.create({
    data: {
      tenantId: masterOrg.id,
      code: 'MAIN-WH',
      name: 'Primary Storage Hub',
      isActive: true,
    },
  });

  console.log('\n======================================================');
  console.log('[SUCCESS] DATABASE INITIALIZED WITH PRIMARY OWNER ACCOUNT');
  console.log('======================================================');
  console.log(`Organization Code: ${masterOrg.code}`);
  console.log(`Organization Name: ${masterOrg.name}`);
  console.log(`User Code:         ${ownerUser.employeeCode}`);
  console.log(`Owner Name:        ${ownerUser.name}`);
  console.log(`Email:             ${ownerUser.email}`);
  console.log('Role:              super_admin (Platform Owner)');
  console.log('Landing Route:     /platform/companies');
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('[ERROR] Reset Error:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
