/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../apps/api/src/ledger/ledger.service';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

async function run() {
  console.log('=== UNLINKED GROUP INVOICES & BALANCE FIX TEST ===');
  const tenantId = 'tenant-test-unlinked-' + Date.now();
  const customerName = 'Delta Synthetic Trading';
  const customerGstin = '29AAACH1234F1Z5';

  try {
    // 1. Create synthetic tenant
    console.log('[1/4] Setting up synthetic tenant...');
    const now = Date.now();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        code: 'TUNLK' + now.toString().slice(-4),
        slug: 'tenant-unlinked-' + now,
        name: 'Synthetic Fixture Tenant',
        email: 'billing@internal-test.local',
        phone: '9876543210',
        gstin: '29AAAAA0000A1Z5',
        bankName: 'Test Bank',
        bankAccountNumber: '123456789012',
        bankIfsc: 'TEST0001234',
      },
    });

    // 2. Create unlinked invoice (no companyId, customerId = null)
    console.log('[2/4] Creating unlinked customer invoice with balance...');
    const invoice = await (prisma as any).invoice.create({
      data: {
        tenantId,
        invoiceNumber: 'INV-TEST-UNLINKED-01',
        customerName,
        customerGstin,
        customerPhone: '9876500000',
        customerState: 'Karnataka',
        companyId: null,
        customerId: null,
        totalAmount: 7500,
        subtotal: 7500,
        balanceDue: 7500,
        paymentStatus: 'unpaid',
        isVoided: false,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 15),
      },
    });
    console.log(`Created invoice ${invoice.invoiceNumber} with balance ₹${invoice.balanceDue} for unlinked party "${customerName}"`);

    // 3. Test LedgerService.getParties returns unlinked party with closing balance
    console.log('[3/4] Calling LedgerService.getParties...');
    const ledgerService = new LedgerService(prisma as any, {} as any);
    const parties = await ledgerService.getParties(tenantId);

    const unlinkedParty = parties.find((c: any) =>
      c.partyType === 'customer' && (
        c.partyName?.toLowerCase() === customerName.toLowerCase() ||
        (c.partyId && c.partyId.startsWith('unlinked:'))
      )
    );

    if (!unlinkedParty) {
      throw new Error(`FAILURE: Unlinked party "${customerName}" was not returned by getParties!`);
    }

    console.log(`Found unlinked party in parties list:`, {
      id: unlinkedParty.partyId,
      name: unlinkedParty.partyName,
      gstin: unlinkedParty.partyGstin,
      closingBalance: unlinkedParty.closingBalance,
    });

    if (unlinkedParty.closingBalance !== 7500) {
      throw new Error(`FAILURE: Expected closingBalance 7500, got ${unlinkedParty.closingBalance}`);
    }
    console.log('✔ Unlinked party shows correct closing balance of ₹7500.');

    // 4. Test getAllOpenDocuments returns the invoice for the unlinked party
    console.log('[4/4] Calling LedgerService.getAllOpenDocuments for unlinked party...');
    const openDocs = await ledgerService.getAllOpenDocuments(tenantId, 'customer', unlinkedParty.partyId);

    console.log(`Retrieved ${openDocs.length} open document(s) for party ${unlinkedParty.partyId}:`, openDocs.map((d: any) => ({
      documentNumber: d.documentNumber,
      totalAmount: d.totalAmount,
      balanceDue: d.balanceDue,
    })));

    if (openDocs.length === 0) {
      throw new Error(
        `FAILURE: "Outstanding balance above 0 but 0 open invoices" bug detected! Balance is ${unlinkedParty.closingBalance} but 0 invoices returned.`
      );
    }

    const matchedDoc = openDocs.find((d: any) => d.id === invoice.id || d.documentNumber === invoice.invoiceNumber);
    if (!matchedDoc) {
      throw new Error(`FAILURE: Open documents does not contain created invoice ${invoice.invoiceNumber}!`);
    }

    if (matchedDoc.balanceDue !== 7500) {
      throw new Error(`FAILURE: Expected invoice balanceDue 7500, got ${matchedDoc.balanceDue}`);
    }

    console.log('✔ Open invoices correctly retrieved for unlinked party. Zero inconsistency confirmed.');
    console.log('\n========================================');
    console.log('ALL UNLINKED GROUP TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');
  } finally {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('\n❌ UNLINKED GROUP TEST FAILED:\n', err);
  process.exit(1);
});
