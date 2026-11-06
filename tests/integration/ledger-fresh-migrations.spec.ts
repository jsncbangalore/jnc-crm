import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../../apps/api/src/ledger/ledger.service';

const THROWAWAY_DB = 'jnc_crm_throwaway_ledger';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const THROWAWAY_URL = `postgresql://postgres:postgres@localhost:5432/${THROWAWAY_DB}?schema=public`;

describe('Ledger Endpoints on Fresh Migrated Database (Step 4)', () => {
  let adminPrisma: PrismaClient;
  let testPrisma: PrismaClient;
  let ledgerService: LedgerService;
  let tenantId: string;
  let customerId: string;

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

    // 1. Terminate existing connections and drop previous throwaway DB if exists
    try {
      await adminPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname = '${THROWAWAY_DB}' AND pid <> pg_backend_pid();
      `);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${THROWAWAY_DB}";`);
    } catch (_) {}

    // 2. Create clean throwaway database
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${THROWAWAY_DB}";`);
    console.log(`[TEST] Created fresh throwaway database: ${THROWAWAY_DB}`);

    // 3. Apply ALL migrations from scratch using prisma migrate deploy
    const schemaPath = path.resolve(process.cwd(), 'apps/api/prisma/schema.prisma');
    execSync(`node node_modules/prisma/build/index.js migrate deploy --schema="${schemaPath}"`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: THROWAWAY_URL,
        DIRECT_URL: THROWAWAY_URL,
      },
    });
    console.log('[TEST] All migrations deployed cleanly on throwaway database.');

    // 4. Connect to throwaway database
    testPrisma = new PrismaClient({ datasources: { db: { url: THROWAWAY_URL } } });
    ledgerService = new LedgerService(testPrisma, {} as any);

    // 5. Seed minimum entities
    tenantId = 'test-tenant-uuid';
    const tenant = await testPrisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Test Tenant Ltd',
        slug: 'test-tenant-ltd',
        code: 'TEST01',
      },
    });

    const user = await testPrisma.user.create({
      data: {
        id: 'test-user-uuid',
        tenantId,
        email: 'admin@testtenant.com',
        name: 'Admin User',
        role: 'tenant_admin',
        employeeCode: 'EMP001',
        passwordHash: 'hashed_pass_placeholder',
      },
    });

    const company = await testPrisma.company.create({
      data: {
        id: 'test-customer-uuid',
        name: 'Acme Test Corp',
        gstin: '29ABCDE1234F1Z5',
        state: 'Karnataka',
        billingEmail: 'billing@acme.com',
        tenant: { connect: { id: tenantId } },
      },
    });
    customerId = company.id;

    await testPrisma.contact.create({
      data: {
        id: 'test-contact-uuid',
        name: 'John Doe',
        phone: '+919876543210',
        email: 'john@acme.com',
        isPrimary: true,
        tenant: { connect: { id: tenantId } },
        company: { connect: { id: customerId } },
      },
    });

    // Create posted invoice
    const invoice = await testPrisma.invoice.create({
      data: {
        id: 'test-invoice-uuid',
        invoiceNumber: 'INV/26-27/0001',
        customerName: 'Acme Test Corp',
        customerPhone: '+919876543210',
        customerGstin: '29ABCDE1234F1Z5',
        totalAmount: 5000,
        balanceDue: 2000,
        advanceAdjusted: 3000,
        subtotal: 4237.29,
        cgstAmount: 381.36,
        sgstAmount: 381.35,
        paymentStatus: 'partially_paid',
        docType: 'tax_invoice',
        tenant: { connect: { id: tenantId } },
        company: { connect: { id: customerId } },
      },
    });

    // Create advance payment record with deductions
    const payment = await testPrisma.paymentRecord.create({
      data: {
        id: 'test-payment-uuid',
        amount: 3000,
        paymentType: 'advance',
        paymentMethod: 'NEFT',
        transactionRef: 'NEFT-TEST-001',
        deductions: [{ type: 'TDS', amount: 100, note: '194C' }] as any,
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customerId } },
        invoice: { connect: { id: invoice.id } },
      },
    });

    await testPrisma.paymentAllocation.create({
      data: {
        id: 'test-alloc-uuid',
        tenantId,
        paymentType: 'customer_receipt',
        amount: 3000,
        paymentRecordId: payment.id,
        invoiceId: invoice.id,
      },
    });

    // Ledger entry
    await testPrisma.ledgerEntry.create({
      data: {
        id: 'test-ledger-entry-1',
        tenantId,
        partyType: 'customer',
        partyId: customerId,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'sales',
        voucherNo: 'INV/26-27/0001',
        particulars: 'To Sales',
        debit: 5000,
        credit: 0,
      },
    });

    await testPrisma.ledgerEntry.create({
      data: {
        id: 'test-ledger-entry-2',
        tenantId,
        partyType: 'customer',
        partyId: customerId,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'receipt',
        voucherNo: 'RCPT-0001',
        particulars: 'By Bank/Advance',
        debit: 0,
        credit: 3000,
      },
    });
  }, 60000);

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
    if (adminPrisma) {
      try {
        await adminPrisma.$executeRawUnsafe(`
          SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
          WHERE datname = '${THROWAWAY_DB}' AND pid <> pg_backend_pid();
        `);
        await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${THROWAWAY_DB}";`);
        console.log(`[TEST] Cleaned up throwaway database: ${THROWAWAY_DB}`);
      } catch (_) {}
      await adminPrisma.$disconnect();
    }
  });

  it('1. Ledger parties list opens and calculates customer balance and ageing without schema/migration errors', async () => {
    const parties = await ledgerService.getParties(tenantId, 'customer');

    expect(parties).toBeDefined();
    expect(parties.length).toBeGreaterThanOrEqual(1);

    const party = parties.find((p) => p.partyId === customerId);
    expect(party).toBeDefined();
    expect(party?.partyName).toBe('Acme Test Corp');
    expect(party?.closingBalance).toBe(2000); // 5000 Dr - 3000 Cr
    expect(party?.balanceSide).toBe('Dr');
    expect(party?.hasPostedInvoices).toBe(true);
  });

  it('2. Ledger statement opens and generates explanation breakdown with deductions', async () => {
    const statement = await ledgerService.getStatement(tenantId, 'customer', customerId, {});

    expect(statement).toBeDefined();
    expect(statement.party.name).toBe('Acme Test Corp');
    expect(statement.closingBalance).toBe(2000);
    expect(statement.closingSide).toBe('Dr');
    expect(statement.entries.length).toBe(2);
    expect(statement.explanation).toBeDefined();
  });

  it('3. Receipt window / open documents query retrieves open documents without missing column errors', async () => {
    const openDocs = await ledgerService.getAllOpenDocuments(tenantId, 'customer', customerId);

    expect(openDocs).toBeDefined();
    expect(Array.isArray(openDocs)).toBe(true);
    expect(openDocs.length).toBe(1);
    expect(openDocs[0].documentNumber).toBe('INV/26-27/0001');
    expect(openDocs[0].balanceDue).toBe(2000);
  });
});
