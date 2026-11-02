/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../.env.development');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadDevEnv();

import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

async function testPaymentsUnification() {
  console.log('========================================================================');
  console.log('TESTING PAYMENTS UNIFICATION & REBUILD-HISTORY RESTRICTION');
  console.log('========================================================================');

  const prisma = new PrismaClient();
  await prisma.$connect();

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'Acme Corporation' } },
    });
    if (!tenant) throw new Error('Tenant Acme Corporation not found.');

    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'tenant_admin' },
    });
    const salesUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'sales' },
    });
    const customer = await prisma.company.findFirst({
      where: { tenantId: tenant.id },
    });
    const supplier = await prisma.supplier.findFirst({
      where: { tenantId: tenant.id },
    });

    if (!admin || !salesUser || !customer || !supplier) {
      throw new Error('Test fixtures (admin, salesUser, customer, supplier) not found.');
    }

    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role, tenantId: tenant.id },
      jwtSecret,
      { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
    );
    const salesToken = jwt.sign(
      { sub: salesUser.id, email: salesUser.email, role: salesUser.role, tenantId: tenant.id },
      jwtSecret,
      { expiresIn: '1h', issuer: 'crm-api', audience: 'crm-client' }
    );

    // 1. Test POST /ledger/payments via PaymentsService for Customer
    console.log('1. Testing POST /ledger/payments for customer...');
    const custPayRes = await fetch('http://localhost:3333/api/v1/ledger/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        partyType: 'customer',
        partyId: customer.id,
        amount: 2500,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: `TEST-CUST-${Date.now().toString().slice(-4)}`,
        notes: 'Test unified customer payment',
        autoAllocate: true,
      }),
    });

    const custPayData = await custPayRes.json();
    if (!custPayRes.ok) {
      throw new Error(`POST /ledger/payments failed: ${JSON.stringify(custPayData)}`);
    }
    console.log('[PASS] POST /ledger/payments (Customer) succeeded. Receipt / Payment Ref:', custPayData.receiptNumber || custPayData.voucherNo);

    // 2. Test POST /ledger/payments for Supplier
    console.log('2. Testing POST /ledger/payments for supplier...');
    const suppPayRes = await fetch('http://localhost:3333/api/v1/ledger/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        partyType: 'supplier',
        partyId: supplier.id,
        amount: 1500,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'NEFT',
        reference: `TEST-SUPP-${Date.now().toString().slice(-4)}`,
        notes: 'Test unified supplier payment',
      }),
    });

    const suppPayData = await suppPayRes.json();
    if (!suppPayRes.ok) {
      throw new Error(`POST /ledger/payments (Supplier) failed: ${JSON.stringify(suppPayData)}`);
    }
    console.log('[PASS] POST /ledger/payments (Supplier) succeeded. Voucher:', suppPayData.voucherNo);

    // 3. Test POST /ledger/rebuild-history authorization
    console.log('3. Testing POST /ledger/rebuild-history authorization...');

    // 3a. Sales user must be rejected with 403 Forbidden
    const unauthRes = await fetch('http://localhost:3333/api/v1/ledger/rebuild-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({}),
    });

    if (unauthRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-admin on /ledger/rebuild-history, got ${unauthRes.status}`);
    }
    console.log('[PASS] Non-admin correctly rejected with 403 Forbidden.');

    // 3b. Admin user succeeds and defaults to dryRun: true
    const adminRes = await fetch('http://localhost:3333/api/v1/ledger/rebuild-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({}), // no dryRun passed -> must default to true
    });

    const adminData = await adminRes.json();
    if (!adminRes.ok) {
      throw new Error(`Admin rebuild history failed: ${JSON.stringify(adminData)}`);
    }

    if (adminData.dryRun !== true) {
      throw new Error(`Expected dryRun to be true by default, got: ${adminData.dryRun}`);
    }
    console.log('[PASS] Admin rebuild-history succeeded with dryRun=true by default.');

    // 3c. Verify Audit Log was recorded for REBUILD_LEDGER_HISTORY
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        action: 'REBUILD_LEDGER_HISTORY',
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!auditEntry) {
      throw new Error('Audit log entry for REBUILD_LEDGER_HISTORY was not found.');
    }
    console.log(`[PASS] Audit log verified for REBUILD_LEDGER_HISTORY (ID: ${auditEntry.id}, Actor: ${auditEntry.actorName})`);

    console.log('------------------------------------------------------------------------');
    console.log('[PAYMENTS UNIFICATION TEST SUCCESS] All requirements verified!');
    process.exit(0);
  } catch (err: any) {
    console.error('[TEST FAILURE]', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPaymentsUnification();
