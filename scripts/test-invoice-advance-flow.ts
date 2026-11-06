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

const API_BASE = 'http://localhost:3333/api/v1';

async function runInvoiceAdvanceFlowTests() {
  console.log('========================================================================');
  console.log('12. ADVANCE ON INVOICE & LEDGER RECONCILIATION TEST SUITE');
  console.log('Target: jnc_crm_dev (PostgreSQL)');
  console.log('========================================================================\n');

  const prisma = new PrismaClient();
  await prisma.$connect();

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';

  const cleanupCompanyIds: string[] = [];
  const cleanupInvoiceIds: string[] = [];
  const cleanupPaymentIds: string[] = [];

  let allPassed = true;
  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
      allPassed = false;
    }
  }

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'tenant_admin' },
      include: { tenant: true },
    });
    if (!admin || !admin.tenant) throw new Error('Tenant / Admin not found in dev database.');
    const tenant = admin.tenant;

    const token = jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        tenantId: tenant.id,
      },
      jwtSecret,
      { expiresIn: '2h', issuer: 'crm-api', audience: 'crm-client' }
    );

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // Helper: calculate customer net ledger balance
    async function getCustomerLedgerBalance(customerId: string): Promise<number> {
      const entries = await prisma.ledgerEntry.findMany({
        where: { tenantId: tenant.id, partyId: customerId },
      });
      const dr = entries.reduce((s, e) => s + Number(e.debit), 0);
      const cr = entries.reduce((s, e) => s + Number(e.credit), 0);
      return Number((dr - cr).toFixed(2));
    }

    // Helper: calculate unallocated advance for customer
    async function getCustomerUnallocatedAdvances(customerId: string): Promise<number> {
      const payments = await prisma.paymentRecord.findMany({
        where: {
          tenantId: tenant.id,
          customerId,
          paymentType: { not: 'refund' },
          reversalOfId: null,
          reversals: { none: {} },
        },
        include: { allocations: true },
      });
      let unalloc = 0;
      for (const p of payments) {
        const allocated = p.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
        unalloc += Math.max(0, Number(p.amount) - allocated);
      }
      return Number(unalloc.toFixed(2));
    }

    // Helper: calculate total open balance of active invoices
    async function getCustomerOpenInvoiceBalances(customerId: string): Promise<number> {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: tenant.id,
          customerId,
          isVoided: false,
          paymentStatus: { in: ['unpaid', 'partial', 'overdue'] },
        },
      });
      const sum = invoices.reduce((s, inv) => s + Number(inv.balanceDue || 0), 0);
      return Number(sum.toFixed(2));
    }

    // ─── STEP 0: CREATE TEST CUSTOMER ──────────────────────────────────────────
    console.log('--- Step 0: Create Isolated Test Customer ---');
    const customer = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Test Advance Customer ${Date.now().toString().slice(-5)}`,
        gstin: '29ABCDE1234F1Z5',
        address: '42 Tech Park, Outer Ring Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        billingEmail: `test-advance-${Date.now().toString().slice(-5)}@example.invalid`,
      },
    });
    cleanupCompanyIds.push(customer.id);
    console.log(`Created test customer: ${customer.name} (ID: ${customer.id})\n`);

    // ─── VALIDATION CHECK: REFUSE ADVANCE LARGER THAN INVOICE TOTAL ───────────
    console.log('--- Validation Check: Refuse Advance Larger than Invoice Total ---');
    const badAdvanceRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerName: customer.name,
        companyId: customer.id,
        customerGstin: customer.gstin,
        customerState: customer.state,
        billingAddress: customer.address,
        advanceAdjusted: 6000, // Exceeds invoice total 5000!
        transactionRef: 'BANK-REF-BAD',
        paymentMethod: 'Bank Transfer',
        lines: [
          {
            description: 'Engineering Consulting Service',
            quantity: 1,
            unitPrice: 5000,
            taxRate: 0,
          },
        ],
      }),
    });

    assert(badAdvanceRes.status === 400, `API refused advance > invoice total with HTTP ${badAdvanceRes.status} Bad Request`);
    const badBody = await badAdvanceRes.json();
    console.log(`  Server rejection response: ${JSON.stringify(badBody.message)}`);
    assert(
      typeof badBody.message === 'string' && badBody.message.includes('cannot exceed the invoice total'),
      'Error message explicitly explains advance cannot exceed total amount\n'
    );

    // ─── CHECK (a) & (b): CREATE TAX INVOICE OF 5,000 WITH 2,000 ADVANCE ────────
    console.log('--- Checks (a) & (b): Create Invoice 5,000 with 2,000 Advance ---');
    const bankRef = `ADV-UTR-${Date.now().toString().slice(-6)}`;
    const createRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerName: customer.name,
        companyId: customer.id,
        customerGstin: customer.gstin,
        customerState: customer.state,
        billingAddress: customer.address,
        advanceAdjusted: 2000,
        transactionRef: bankRef,
        paymentMethod: 'Bank Transfer',
        lines: [
          {
            description: 'Industrial Sensor Calibration',
            quantity: 1,
            unitPrice: 5000,
            taxRate: 0,
          },
        ],
      }),
    });

    assert(createRes.status === 201, `Invoice created successfully with HTTP ${createRes.status}`);
    const invData = await createRes.json();
    cleanupInvoiceIds.push(invData.id);

    console.log(`  Invoice Created: #${invData.invoiceNumber} (ID: ${invData.id})`);
    console.log(`  Total Amount: ₹${invData.totalAmount}`);
    console.log(`  Advance Adjusted: ₹${invData.advanceAdjusted}`);
    console.log(`  Balance Due: ₹${invData.balanceDue}`);
    console.log(`  Payment Status: ${invData.paymentStatus}`);

    // Check (a)
    assert(Number(invData.totalAmount) === 5000, 'Check (a): Invoice total is exactly ₹5,000');
    assert(Number(invData.balanceDue) === 3000, 'Check (a): Invoice balance due is exactly ₹3,000');
    assert(Number(invData.advanceAdjusted) === 2000, 'Check (a): Invoice advanceAdjusted is ₹2,000');
    assert(invData.paymentStatus === 'partial', 'Check (a): Invoice status is partial');

    // Check (b): Inspect customer ledger statement
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id, partyId: customer.id },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`\n  Ledger entries for customer (${ledgerEntries.length} entries):`);
    for (const le of ledgerEntries) {
      console.log(`    - [${le.voucherType.toUpperCase()}] Voucher #${le.voucherNo} | Dr: ₹${le.debit} | Cr: ₹${le.credit} | ${le.particulars}`);
    }

    const salesEntry = ledgerEntries.find((e) => e.sourceType === 'invoice' && e.sourceId === invData.id);
    const receiptEntry = ledgerEntries.find((e) => e.sourceType === 'payment' && Number(e.credit) === 2000);

    assert(Boolean(salesEntry), 'Check (b): Customer ledger shows 5,000 Debit invoice entry');
    assert(Number(salesEntry?.debit) === 5000 && Number(salesEntry?.credit) === 0, 'Check (b): Sales entry is Dr ₹5,000, Cr ₹0');
    assert(Boolean(receiptEntry), 'Check (b): Customer ledger shows 2,000 Credit receipt/advance entry');
    assert(Number(receiptEntry?.credit) === 2000 && Number(receiptEntry?.debit) === 0, 'Check (b): Advance entry is Cr ₹2,000, Dr ₹0');
    assert(
      receiptEntry?.particulars.includes(invData.invoiceNumber) && receiptEntry?.particulars.includes(bankRef),
      `Check (b): Advance entry links to invoice #${invData.invoiceNumber} with bank reference [${bankRef}]`
    );

    const partyBalStepB = await getCustomerLedgerBalance(customer.id);
    console.log(`  Customer Party Ledger Balance: ₹${partyBalStepB} DR`);
    assert(partyBalStepB === 3000, 'Check (b): Party ledger balance is 3,000 DR');
    assert(partyBalStepB === Number(invData.balanceDue), 'Check (b): Party ledger balance (3,000 DR) EQUALS invoice balance due (₹3,000)\n');

    // Invariant check at Step B
    const openInvsB = await getCustomerOpenInvoiceBalances(customer.id);
    const unallocB = await getCustomerUnallocatedAdvances(customer.id);
    assert(partyBalStepB === Number((openInvsB - unallocB).toFixed(2)), `Invariant Check B: Ledger (${partyBalStepB}) = Invoices (${openInvsB}) - Unallocated (${unallocB})`);

    // ─── CHECK (c): RECEIPT WINDOW LISTS INVOICE WITH 3,000 OPEN ──────────────
    console.log('\n--- Check (c): Receipt Window Lists Invoice with 3,000 Open ---');
    const accountSummaryRes = await fetch(`${API_BASE}/customers/${customer.id}/account-summary`, {
      method: 'GET',
      headers,
    });
    assert(accountSummaryRes.status === 200, `Account summary returned HTTP ${accountSummaryRes.status}`);
    const summaryData = await accountSummaryRes.json();

    const openInvInModal = summaryData.invoices.find((i: any) => i.id === invData.id);
    assert(Boolean(openInvInModal), 'Check (c): Customer account summary / receipt list contains the invoice');
    assert(Number(openInvInModal?.balanceDue) === 3000, `Check (c): Receipt window lists invoice with open balanceDue of ₹${openInvInModal?.balanceDue}`);
    assert(openInvInModal?.status === 'partial', `Check (c): Invoice status in receipt window is '${openInvInModal?.status}'\n`);

    // ─── CHECK (d): PAYING REMAINING 3,000 MAKES IT PAID & LEDGER BALANCE 0 ───
    console.log('--- Check (d): Pay Remaining 3,000 via Receipt Settlement ---');
    const settleRef = `UTRSETTLE${Date.now().toString().slice(-8)}`;
    const payRes = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: customer.id,
        amount: 3000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'NEFT',
        reference: settleRef,
        notes: 'Final settlement of invoice remaining balance',
        allocations: [
          {
            invoiceId: invData.id,
            amount: 3000,
          },
        ],
      }),
    });

    const payData = await payRes.json();
    if (!payRes.ok) console.error('  Payment Error:', payData);
    assert(payRes.status === 200 || payRes.status === 201, `Payment recorded with HTTP ${payRes.status}`);
    const recordedPaymentId = payData.id || payData.payment?.id || payData.paymentId;
    if (recordedPaymentId) cleanupPaymentIds.push(recordedPaymentId);

    // Refresh invoice
    const invAfterPay = await prisma.invoice.findUnique({ where: { id: invData.id } });
    console.log(`  Invoice after ₹3,000 payment: Balance Due = ₹${invAfterPay?.balanceDue}, Status = ${invAfterPay?.paymentStatus}`);
    assert(Number(invAfterPay?.balanceDue) === 0, 'Check (d): Invoice balance due is ₹0.00');
    assert(invAfterPay?.paymentStatus === 'paid', "Check (d): Invoice payment status is 'paid'");

    const partyBalStepD = await getCustomerLedgerBalance(customer.id);
    console.log(`  Customer Party Ledger Balance after payment: ₹${partyBalStepD}`);
    assert(partyBalStepD === 0, 'Check (d): Party ledger balance is exactly 0.00');

    // Invariant check at Step D
    const openInvsD = await getCustomerOpenInvoiceBalances(customer.id);
    const unallocD = await getCustomerUnallocatedAdvances(customer.id);
    assert(partyBalStepD === Number((openInvsD - unallocD).toFixed(2)), `Invariant Check D: Ledger (${partyBalStepD}) = Invoices (${openInvsD}) - Unallocated (${unallocD})\n`);

    // ─── CHECK (e): REVERSING LAST RECEIPT RETURNS INVOICE TO PARTIAL (3,000 DUE)
    console.log('--- Check (e): Reverse the Last Receipt (3,000) ---');
    const reverseRes = await fetch(`${API_BASE}/payments/${recordedPaymentId}/reverse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'Customer cheque returned / bank reversal request',
      }),
    });

    assert(reverseRes.status === 200, `Payment reversed with HTTP ${reverseRes.status}`);
    const revData = await reverseRes.json();

    const invAfterRev = await prisma.invoice.findUnique({ where: { id: invData.id } });
    console.log(`  Invoice after receipt reversal: Balance Due = ₹${invAfterRev?.balanceDue}, Status = ${invAfterRev?.paymentStatus}`);
    assert(Number(invAfterRev?.balanceDue) === 3000, 'Check (e): Invoice balance due returned to ₹3,000.00');
    assert(invAfterRev?.paymentStatus === 'partial', "Check (e): Invoice payment status returned to 'partial'");

    const partyBalStepE = await getCustomerLedgerBalance(customer.id);
    console.log(`  Customer Party Ledger Balance after reversal: ₹${partyBalStepE} DR`);
    assert(partyBalStepE === 3000, 'Check (e): Party ledger balance returned to 3,000 DR');
    assert(partyBalStepE === Number(invAfterRev?.balanceDue), 'Check (e): Party balance equals invoice balance due (₹3,000)');

    // Invariant check at Step E
    const openInvsE = await getCustomerOpenInvoiceBalances(customer.id);
    const unallocE = await getCustomerUnallocatedAdvances(customer.id);
    assert(partyBalStepE === Number((openInvsE - unallocE).toFixed(2)), `Invariant Check E: Ledger (${partyBalStepE}) = Invoices (${openInvsE}) - Unallocated (${unallocE})\n`);

    // ─── CHECK (f): VOIDING INVOICE REVERSES BOTH DEBIT AND ADVANCE CREDIT ────
    console.log('--- Check (f): Void Invoice Reverses Both Debit (5,000) and Advance Credit (2,000) ---');
    const voidRes = await fetch(`${API_BASE}/invoices/${invData.id}/void`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        reason: 'Client cancelled contract before fulfillment',
      }),
    });

    assert(voidRes.status === 200 || voidRes.status === 201, `Invoice voided with HTTP ${voidRes.status}`);
    const voidData = await voidRes.json();
    assert(voidData.isVoided === true, 'Check (f): Invoice marked isVoided = true');

    const finalEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id, partyId: customer.id },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`\n  Customer Ledger Entries after Voiding (${finalEntries.length} total entries):`);
    for (const fe of finalEntries) {
      console.log(`    - [${fe.voucherType.toUpperCase()}] Voucher #${fe.voucherNo} | Dr: ₹${fe.debit} | Cr: ₹${fe.credit} | Source: ${fe.sourceType} | ${fe.particulars}`);
    }

    const invVoidReversal = finalEntries.find((e) => e.sourceType === 'invoice_void');
    const advVoidReversal = finalEntries.find((e) => e.sourceType === 'payment_reversal' && Number(e.debit) === 2000);

    assert(Boolean(invVoidReversal), 'Check (f): Found invoice void reversal entry (reversing 5,000 debit)');
    assert(Number(invVoidReversal?.credit) === 5000 && Number(invVoidReversal?.debit) === 0, 'Check (f): Invoice void reversal is Cr ₹5,000, Dr ₹0');
    assert(Boolean(advVoidReversal), 'Check (f): Found advance payment reversal entry (reversing 2,000 credit)');
    assert(Number(advVoidReversal?.debit) === 2000 && Number(advVoidReversal?.credit) === 0, 'Check (f): Advance payment reversal is Dr ₹2,000, Cr ₹0');

    const partyBalStepF = await getCustomerLedgerBalance(customer.id);
    console.log(`  Customer Party Ledger Balance after voiding: ₹${partyBalStepF}`);
    assert(partyBalStepF === 0, 'Check (f): Customer net ledger balance is exactly 0.00 DR after voiding!');

    // Invariant check at Step F
    const openInvsF = await getCustomerOpenInvoiceBalances(customer.id);
    const unallocF = await getCustomerUnallocatedAdvances(customer.id);
    assert(partyBalStepF === Number((openInvsF - unallocF).toFixed(2)), `Invariant Check F: Ledger (${partyBalStepF}) = Invoices (${openInvsF}) - Unallocated (${unallocF})\n`);

    // ─── GENERAL INVARIANT CHECK ACROSS MULTIPLE TEST PARTIES ──────────────────
    console.log('--- General Invariant Check Across Diverse Test Scenarios ---');
    console.log('Formula: Net Ledger Balance (DR) = Sum(Invoice.balanceDue) - Sum(Unallocated Advances)');

    // Create 3 additional test customer scenarios to exhaustively verify the invariant
    // Party A: Invoice with partial payment (no advance)
    const custA = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Matrix Customer A ${Date.now().toString().slice(-4)}`,
        gstin: '29ABCDE1234F1Z5',
        address: 'Sector 5, HSR Layout',
        city: 'Bengaluru',
        state: 'Karnataka',
        billingEmail: `cust-a-${Date.now()}@example.invalid`,
      },
    });
    cleanupCompanyIds.push(custA.id);

    const invARes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerName: custA.name,
        companyId: custA.id,
        customerGstin: custA.gstin,
        customerState: custA.state,
        billingAddress: custA.address,
        lines: [{ description: 'Calibration Service', quantity: 1, unitPrice: 10000, taxRate: 0 }],
      }),
    });
    const invAData = await invARes.json();
    cleanupInvoiceIds.push(invAData.id);

    // Part payment of 4000
    const payARes = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: custA.id,
        amount: 4000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'NEFT',
        reference: `UTRMATA${Date.now().toString().slice(-8)}`,
        allocations: [{ invoiceId: invAData.id, amount: 4000 }],
      }),
    });
    const payAData = await payARes.json();
    const payAId = payAData.id || payAData.payment?.id || payAData.paymentId;
    if (payAId) cleanupPaymentIds.push(payAId);

    // Party B: Unallocated Advance with no invoice
    const custB = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Matrix Customer B ${Date.now().toString().slice(-4)}`,
        gstin: '29ABCDE1234F1Z5',
        address: 'Whitefield Industrial Area',
        city: 'Bengaluru',
        state: 'Karnataka',
        billingEmail: `cust-b-${Date.now()}@example.invalid`,
      },
    });
    cleanupCompanyIds.push(custB.id);

    const payBRes = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: custB.id,
        amount: 7500,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'NEFT',
        reference: `UTRMATB${Date.now().toString().slice(-8)}`,
        allowAdvance: true,
        notes: 'Prepayment without order',
      }),
    });
    const payBData = await payBRes.json();
    const payBId = payBData.id || payBData.payment?.id || payBData.paymentId;
    if (payBId) cleanupPaymentIds.push(payBId);

    // Party C: Invoice of 8000 with 3000 advance
    const custC = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Matrix Customer C ${Date.now().toString().slice(-4)}`,
        gstin: '29ABCDE1234F1Z5',
        address: 'Electronic City Phase 1',
        city: 'Bengaluru',
        state: 'Karnataka',
        billingEmail: `cust-c-${Date.now()}@example.invalid`,
      },
    });
    cleanupCompanyIds.push(custC.id);

    const invCRes = await fetch(`${API_BASE}/invoices/create-direct`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        docType: 'tax_invoice',
        customerName: custC.name,
        companyId: custC.id,
        customerGstin: custC.gstin,
        customerState: custC.state,
        billingAddress: custC.address,
        advanceAdjusted: 3000,
        transactionRef: `UTRMATC${Date.now().toString().slice(-8)}`,
        paymentMethod: 'Bank Transfer',
        lines: [{ description: 'Software License', quantity: 1, unitPrice: 8000, taxRate: 0 }],
      }),
    });
    const invCData = await invCRes.json();
    cleanupInvoiceIds.push(invCData.id);

    const testParties = [
      { name: 'Customer (Voided Flow)', id: customer.id },
      { name: 'Customer A (Partially Paid Invoice)', id: custA.id },
      { name: 'Customer B (Standalone Advance)', id: custB.id },
      { name: 'Customer C (Active Invoice with Advance)', id: custC.id },
    ];

    for (const tp of testParties) {
      const netLedger = await getCustomerLedgerBalance(tp.id);
      const sumInvoices = await getCustomerOpenInvoiceBalances(tp.id);
      const unallocAdv = await getCustomerUnallocatedAdvances(tp.id);
      const expected = Number((sumInvoices - unallocAdv).toFixed(2));
      const match = Math.abs(netLedger - expected) <= 0.01;
      console.log(`  Party: ${tp.name} -> Ledger: ₹${netLedger} DR | Invoices Due: ₹${sumInvoices} | Unalloc Advance: ₹${unallocAdv} | Expected: ₹${expected} DR`);
      assert(match, `General Invariant holds for ${tp.name}: Ledger (${netLedger}) == Invoices (${sumInvoices}) - Unalloc (${unallocAdv})`);
    }

  } finally {
    // Clean up test data
    console.log('\n--- Cleaning Up Test Records ---');
    try {
      const validPaymentIds = cleanupPaymentIds.filter(Boolean);
      if (validPaymentIds.length > 0) {
        await prisma.paymentAllocation.deleteMany({ where: { paymentRecordId: { in: validPaymentIds } } });
        await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: validPaymentIds } } });
        await prisma.paymentRecord.deleteMany({ where: { id: { in: validPaymentIds } } });
      }
      const validInvoiceIds = cleanupInvoiceIds.filter(Boolean);
      if (validInvoiceIds.length > 0) {
        await prisma.paymentAllocation.deleteMany({ where: { invoiceId: { in: validInvoiceIds } } });
        const tiedPayments = await prisma.paymentRecord.findMany({ where: { invoiceId: { in: validInvoiceIds } } });
        const tiedIds = tiedPayments.map((p) => p.id);
        if (tiedIds.length > 0) {
          await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: tiedIds } } });
          await prisma.paymentRecord.deleteMany({ where: { id: { in: tiedIds } } });
        }
        await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: validInvoiceIds } } });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: validInvoiceIds } } });
        await prisma.invoice.deleteMany({ where: { id: { in: validInvoiceIds } } });
      }
      const validCompanyIds = cleanupCompanyIds.filter(Boolean);
      if (validCompanyIds.length > 0) {
        await prisma.ledgerEntry.deleteMany({ where: { partyId: { in: validCompanyIds } } });
        await prisma.company.deleteMany({ where: { id: { in: validCompanyIds } } });
      }
      console.log('Cleaned up test customer, invoices, payments, and ledger entries.');
    } catch (cleanErr: any) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  if (allPassed) {
    console.log('SUCCESS: All Advance on Invoice & Ledger Reconciliation Tests PASSED (100%)');
  } else {
    console.log('FAILURE: Some tests FAILED. See details above.');
    process.exit(1);
  }
  console.log('========================================================================\n');
}

runInvoiceAdvanceFlowTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
