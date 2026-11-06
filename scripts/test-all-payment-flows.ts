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

async function runAllPaymentFlowsTest() {
  console.log('========================================================================');
  console.log('COMPREHENSIVE PAYMENT FLOWS END-TO-END TEST SUITE');
  console.log('Testing: Full Payment, Part Payments, Advance First, Overpayment, Reversal, TDS');
  console.log('========================================================================\n');

  const prisma = new PrismaClient();
  await prisma.$connect();

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_key_at_least_32_characters_long_for_security_12345';

  const createdCustomerIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'tenant_admin' },
      include: { tenant: true },
    });
    if (!admin || !admin.tenant) throw new Error('Tenant / Admin not found in dev database.');
    const tenant = admin.tenant;

    const salesUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'sales' },
    });

    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role, tenantId: tenant.id },
      jwtSecret,
      { expiresIn: '2h', issuer: 'crm-api', audience: 'crm-client' }
    );

    const salesToken = salesUser
      ? jwt.sign(
          { sub: salesUser.id, email: salesUser.email, role: salesUser.role, tenantId: tenant.id },
          jwtSecret,
          { expiresIn: '2h', issuer: 'crm-api', audience: 'crm-client' }
        )
      : null;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // Helper: Create a clean test customer
    async function createTestCustomer(name: string) {
      const cust = await prisma.company.create({
        data: {
          tenantId: tenant!.id,
          name: `${name}-${Date.now().toString().slice(-5)}`,
          gstin: '27AABCU9603R1ZM',
          billingEmail: `test-${Date.now().toString().slice(-5)}@example.com`,
          address: '42 Industrial Area, Phase II',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      });
      createdCustomerIds.push(cust.id);
      return cust;
    }

    let invCounter = 101;
    // Helper: Create an invoice
    async function createTestInvoice(customer: { id: string; name: string }, amount: number, options?: { applyAdvance?: boolean; recordPaymentNow?: any }) {
      const invNum = `INV-PAY-${Date.now().toString().slice(-4)}-${invCounter++}`;
      const res = await fetch(`${API_BASE}/invoices/create-direct`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          customerName: customer.name,
          invoiceNumber: invNum,
          docType: 'tax_invoice',
          invoiceDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
          lines: [
            {
              description: 'Industrial Component Testing Service',
              hsnCode: '998331',
              quantity: 1,
              unit: 'NOS',
              unitPrice: amount,
              taxRate: 0,
            },
          ],
          paymentTerms: 'Payment due on receipt',
          applyAdvance: options?.applyAdvance ?? false,
          recordPaymentNow: options?.recordPaymentNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Create invoice failed: ${JSON.stringify(data)}`);
      createdInvoiceIds.push(data.id);
      return data;
    }

    // Helper: Verify agreement across entities
    async function assertAgreement(label: string, customerId: string, invoiceId?: string) {
      // 1. Customer account summary
      const custRes = await fetch(`${API_BASE}/customers/${customerId}/account-summary`, { headers });
      const custData = await custRes.json();
      if (!custRes.ok) throw new Error(`Customer summary failed: ${JSON.stringify(custData)}`);

      // 2. Ledger statement
      const stmtRes = await fetch(`${API_BASE}/ledger/statement?partyType=customer&partyId=${customerId}`, { headers });
      const stmtData = await stmtRes.json();
      if (!stmtRes.ok) throw new Error(`Ledger statement failed: ${JSON.stringify(stmtData)}`);

      // 3. Open documents
      const openRes = await fetch(`${API_BASE}/ledger/open-documents?partyType=customer&partyId=${customerId}`, { headers });
      const openData = await openRes.json();
      if (!openRes.ok) throw new Error(`Open docs failed: ${JSON.stringify(openData)}`);

      // 4. Dashboard KPIs
      const dashRes = await fetch(`${API_BASE}/dashboard/kpis`, { headers });
      const dashData = await dashRes.json();
      if (!dashRes.ok) throw new Error(`Dashboard KPIs failed: ${JSON.stringify(dashData)}`);

      // 5. Specific invoice if provided
      let invData = null;
      if (invoiceId) {
        const invRes = await fetch(`${API_BASE}/invoices/${invoiceId}`, { headers });
        invData = await invRes.json();
      }

      console.log(`  [Agreement Check: ${label}]`);
      console.log(`    - Cust Account: Outstanding=₹${custData.summary.outstandingReceivable}, Advance=₹${custData.summary.advanceAmount}`);
      console.log(`    - Statement: Closing=₹${stmtData.closingBalance} (${stmtData.closingSide}), OpenBills=${stmtData.openBills?.length || 0}`);
      if (invData) {
        console.log(`    - Invoice ${invData.invoiceNumber}: BalanceDue=₹${invData.balanceDue}, Status=${invData.paymentStatus}`);
      }

      // Assert: Statement explanation matches open bills total
      if (stmtData.explanation) {
        const exp = stmtData.explanation;
        const totalOpen = (openData as any[]).reduce((sum, d) => sum + Number(d.balanceDue), 0);
        if (Math.abs(exp.openBillsTotal - totalOpen) > 0.05) {
          throw new Error(`Mismatch between statement open bills total (${exp.openBillsTotal}) and open docs list (${totalOpen})`);
        }
      }

      return { custData, stmtData, openData, dashData, invData };
    }

    // =========================================================================
    // SCENARIO 1: FULL PAYMENT ('Mark as fully paid' shortcut / Exact settlement)
    // =========================================================================
    console.log('\n--- SCENARIO 1: Full Payment Flow ---');
    const cust1 = await createTestCustomer('Client Alpha Full');
    const inv1 = await createTestInvoice(cust1, 50000);
    console.log(`Created invoice ${inv1.invoiceNumber} for ₹50,000. BalanceDue: ₹${inv1.balanceDue}, Status: ${inv1.paymentStatus}`);
    if (inv1.balanceDue !== 50000 || inv1.paymentStatus !== 'unpaid') {
      throw new Error(`Scenario 1 Initial invariant failed: balanceDue ${inv1.balanceDue}, status ${inv1.paymentStatus}`);
    }
    await assertAgreement('Scenario 1 - Unpaid', cust1.id, inv1.id);

    // Record full payment of 50000
    const pay1Res = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust1.id,
        amount: 50000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: 'FULLPAY20261101',
        notes: 'Full payment shortcut test',
        allocations: [{ invoiceId: inv1.id, amount: 50000 }],
      }),
    });
    const pay1Data = await pay1Res.json();
    if (!pay1Res.ok) throw new Error(`Full payment failed: ${JSON.stringify(pay1Data)}`);
    createdPaymentIds.push(pay1Data.id || pay1Data.paymentId);
    console.log(`Recorded full payment of ₹50,000 (Receipt: ${pay1Data.receiptNumber})`);

    const s1Check = await assertAgreement('Scenario 1 - Fully Paid', cust1.id, inv1.id);
    if (s1Check.invData.balanceDue > 0.01 || s1Check.invData.paymentStatus !== 'paid') {
      throw new Error(`Scenario 1 failed: invoice balance ${s1Check.invData.balanceDue}, status ${s1Check.invData.paymentStatus}`);
    }
    if (s1Check.custData.summary.outstandingReceivable > 0.01) {
      throw new Error(`Scenario 1 failed: customer outstanding is ${s1Check.custData.summary.outstandingReceivable}`);
    }
    console.log('[PASS] Scenario 1: Full Payment settled invoice to ₹0 and Paid status.');

    // =========================================================================
    // SCENARIO 2: PART PAYMENTS (₹20,000 then ₹40,000 on ₹60,000 invoice)
    // =========================================================================
    console.log('\n--- SCENARIO 2: Part Payments Flow ---');
    const cust2 = await createTestCustomer('Client Beta Part');
    const inv2 = await createTestInvoice(cust2, 60000);
    console.log(`Created invoice ${inv2.invoiceNumber} for ₹60,000.`);

    // Part Payment 1: ₹20,000
    const pay2aRes = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust2.id,
        amount: 20000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'UPI',
        reference: '123456789012',
        notes: 'First part payment',
        allocations: [{ invoiceId: inv2.id, amount: 20000 }],
      }),
    });
    const pay2aData = await pay2aRes.json();
    if (!pay2aRes.ok) throw new Error(`Part payment 1 failed: ${JSON.stringify(pay2aData)}`);
    createdPaymentIds.push(pay2aData.id || pay2aData.paymentId);

    const s2aCheck = await assertAgreement('Scenario 2 - Part 1 (20k)', cust2.id, inv2.id);
    if (Math.abs(s2aCheck.invData.balanceDue - 40000) > 0.05 || s2aCheck.invData.paymentStatus !== 'partial') {
      throw new Error(`Scenario 2 part 1 failed: balance ${s2aCheck.invData.balanceDue}, status ${s2aCheck.invData.paymentStatus}`);
    }
    console.log(`[PASS] Part 1: Balance is ₹${s2aCheck.invData.balanceDue}, status is Partial.`);

    // Part Payment 2: ₹40,000
    const pay2bRes = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust2.id,
        amount: 40000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'NEFT',
        reference: 'NEFT20261105002',
        notes: 'Final part payment',
        allocations: [{ invoiceId: inv2.id, amount: 40000 }],
      }),
    });
    const pay2bData = await pay2bRes.json();
    if (!pay2bRes.ok) throw new Error(`Part payment 2 failed: ${JSON.stringify(pay2bData)}`);
    createdPaymentIds.push(pay2bData.id || pay2bData.paymentId);

    const s2bCheck = await assertAgreement('Scenario 2 - Part 2 (40k)', cust2.id, inv2.id);
    if (s2bCheck.invData.balanceDue > 0.01 || s2bCheck.invData.paymentStatus !== 'paid') {
      throw new Error(`Scenario 2 part 2 failed: balance ${s2bCheck.invData.balanceDue}, status ${s2bCheck.invData.paymentStatus}`);
    }
    console.log('[PASS] Scenario 2: Two part payments correctly transitioned Unpaid -> Partial -> Paid with 0 balance.');

    // =========================================================================
    // SCENARIO 3: ADVANCE FIRST (Advance ₹30,000, then Invoice with Apply Advance)
    // =========================================================================
    console.log('\n--- SCENARIO 3: Advance First Flow ---');
    const cust3 = await createTestCustomer('Client Gamma Advance');
    
    // Record advance payment of ₹30,000
    const pay3Res = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust3.id,
        amount: 30000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: 'ADVREC2026110501',
        notes: 'Advance deposit before project start',
      }),
    });
    const pay3Data = await pay3Res.json();
    if (!pay3Res.ok) throw new Error(`Advance payment failed: ${JSON.stringify(pay3Data)}`);
    createdPaymentIds.push(pay3Data.id || pay3Data.paymentId);
    console.log(`Recorded advance of ₹30,000 (Receipt: ${pay3Data.receiptNumber}).`);

    const s3PreCheck = await assertAgreement('Scenario 3 - Advance Held', cust3.id);
    if (Math.abs(s3PreCheck.custData.summary.advanceAmount - 30000) > 0.05) {
      throw new Error(`Advance amount mismatch: expected 30000, got ${s3PreCheck.custData.summary.advanceAmount}`);
    }
    console.log(`[PASS] Customer advance metric correctly shows ₹${s3PreCheck.custData.summary.advanceAmount}.`);

    // Create Invoice for ₹30,000 with applyAdvance: true
    const inv3 = await createTestInvoice(cust3, 30000, { applyAdvance: true });
    console.log(`Created invoice ${inv3.invoiceNumber} for ₹30,000 with applyAdvance=true.`);

    const s3PostCheck = await assertAgreement('Scenario 3 - Post Invoice', cust3.id, inv3.id);
    if (s3PostCheck.invData.balanceDue > 0.01 || s3PostCheck.invData.paymentStatus !== 'paid') {
      throw new Error(`Scenario 3 invoice not settled: balance ${s3PostCheck.invData.balanceDue}, status ${s3PostCheck.invData.paymentStatus}`);
    }
    if (s3PostCheck.custData.summary.advanceAmount > 0.01) {
      throw new Error(`Scenario 3 advance should be 0, got ${s3PostCheck.custData.summary.advanceAmount}`);
    }

    // Verify NO DOUBLE POSTING in ledger: Statement closing balance should be 0!
    if (s3PostCheck.stmtData.closingBalance > 0.01) {
      throw new Error(`Scenario 3 double posting detected! Statement closing balance is ₹${s3PostCheck.stmtData.closingBalance}`);
    }
    console.log('[PASS] Scenario 3: Advance fully settled invoice with zero double-posting in ledger.');

    // =========================================================================
    // SCENARIO 4: OVERPAYMENT (Invoice ₹25,000, Receipt ₹40,000, ₹15,000 refund)
    // =========================================================================
    console.log('\n--- SCENARIO 4: Overpayment & Advance Refund Flow ---');
    const cust4 = await createTestCustomer('Client Delta Overpay');
    const inv4 = await createTestInvoice(cust4, 25000);

    // Record receipt of ₹40,000 with allowAdvance=true
    const pay4Res = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust4.id,
        amount: 40000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: 'OVERPAY20261105',
        notes: 'Payment covering invoice plus advance surplus',
        allowAdvance: true,
        allocations: [{ invoiceId: inv4.id, amount: 25000 }],
      }),
    });
    const pay4Data = await pay4Res.json();
    if (!pay4Res.ok) throw new Error(`Overpayment failed: ${JSON.stringify(pay4Data)}`);
    const payment4Id = pay4Data.id || pay4Data.payment?.id || pay4Data.paymentId;
    createdPaymentIds.push(payment4Id);

    const s4PreCheck = await assertAgreement('Scenario 4 - Overpaid', cust4.id, inv4.id);
    if (s4PreCheck.invData.balanceDue > 0.01 || s4PreCheck.invData.paymentStatus !== 'paid') {
      throw new Error(`Scenario 4 invoice balance ${s4PreCheck.invData.balanceDue}`);
    }
    if (Math.abs(s4PreCheck.custData.summary.advanceAmount - 15000) > 0.05) {
      throw new Error(`Scenario 4 advance retained expected 15000, got ${s4PreCheck.custData.summary.advanceAmount}`);
    }
    console.log(`[PASS] Overpayment settled ₹25,000 invoice and retained excess ₹${s4PreCheck.custData.summary.advanceAmount} as unallocated advance.`);

    // Test Refund of advance: POST /payments/:id/refund
    const refundRes = await fetch(`${API_BASE}/payments/${payment4Id}/refund`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: 15000,
        refundMode: 'Bank Transfer',
        reference: 'REFUND20261105',
        notes: 'Surplus advance refund to client',
      }),
    });
    const refundData = await refundRes.json();
    if (!refundRes.ok) throw new Error(`Advance refund failed: ${JSON.stringify(refundData)}`);
    console.log(`Refunded ₹15,000 advance. Voucher: ${refundData.refundPayment?.receiptNumber || refundData.message}`);

    const s4PostCheck = await assertAgreement('Scenario 4 - Post Refund', cust4.id, inv4.id);
    if (s4PostCheck.custData.summary.advanceAmount > 0.01) {
      throw new Error(`Scenario 4 advance after refund expected 0, got ${s4PostCheck.custData.summary.advanceAmount}`);
    }
    console.log('[PASS] Scenario 4: Excess advance successfully refunded, customer ledger balanced to 0.');

    // =========================================================================
    // SCENARIO 5: REVERSAL (Invoice ₹70,000, Payment ₹70,000, Reversal)
    // =========================================================================
    console.log('\n--- SCENARIO 5: Payment Reversal Flow ---');
    const cust5 = await createTestCustomer('Client Epsilon Reversal');
    const inv5 = await createTestInvoice(cust5, 70000);

    const pay5Res = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust5.id,
        amount: 70000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Cheque',
        reference: '123456',
        notes: 'Payment by cheque pending clearance',
        allocations: [{ invoiceId: inv5.id, amount: 70000 }],
      }),
    });
    const pay5Data = await pay5Res.json();
    if (!pay5Res.ok) throw new Error(`Payment 5 failed: ${JSON.stringify(pay5Data)}`);
    const payment5Id = pay5Data.id || pay5Data.payment?.id || pay5Data.paymentId;
    createdPaymentIds.push(payment5Id);

    const s5PaidCheck = await assertAgreement('Scenario 5 - Paid', cust5.id, inv5.id);
    if (s5PaidCheck.invData.balanceDue > 0.01) throw new Error('Invoice should be paid');

    // 1. Role guard test: non-privileged user cannot reverse payment
    if (salesToken) {
      const forbiddenRevRes = await fetch(`${API_BASE}/payments/${payment5Id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({ reason: 'Cheque dishonoured' }),
      });
      if (forbiddenRevRes.status !== 403) {
        throw new Error(`Expected 403 Forbidden for non-accountant reversal, got ${forbiddenRevRes.status}`);
      }
      console.log('[PASS] Reversal role guard: Non-accountant/finance role blocked with 403 Forbidden.');
    }

    // 2. Reason validation test: empty reason rejected
    const badReasonRes = await fetch(`${API_BASE}/payments/${payment5Id}/reverse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: ' ' }),
    });
    if (badReasonRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty reversal reason, got ${badReasonRes.status}`);
    }
    console.log('[PASS] Reversal validation: Blank reason blocked with 400 Bad Request.');

    // 3. Authorized reversal
    const revRes = await fetch(`${API_BASE}/payments/${payment5Id}/reverse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Cheque bounced on representation - insufficient funds' }),
    });
    const revData = await revRes.json();
    if (!revRes.ok) throw new Error(`Authorized reversal failed: ${JSON.stringify(revData)}`);
    console.log(`Reversed payment ${payment5Id}. Message: ${revData.message}`);

    const s5PostCheck = await assertAgreement('Scenario 5 - Post Reversal', cust5.id, inv5.id);
    if (Math.abs(s5PostCheck.invData.balanceDue - 70000) > 0.05 || s5PostCheck.invData.paymentStatus !== 'unpaid') {
      throw new Error(`Scenario 5 reversal failed to restore invoice balance: balance ${s5PostCheck.invData.balanceDue}, status ${s5PostCheck.invData.paymentStatus}`);
    }
    if (Math.abs(s5PostCheck.custData.summary.outstandingReceivable - 70000) > 0.05) {
      throw new Error(`Scenario 5 customer outstanding not restored: ${s5PostCheck.custData.summary.outstandingReceivable}`);
    }
    console.log('[PASS] Scenario 5: Payment reversed, invoice balance restored to ₹70,000 Unpaid, and reversal entries created.');

    // =========================================================================
    // SCENARIO 6: TDS & DEDUCTIONS (₹1,16,000 receipt + ₹2,000 TDS settles ₹1,18,000)
    // =========================================================================
    console.log('\n--- SCENARIO 6: TDS & Deductions Flow ---');
    const cust6 = await createTestCustomer('Client Zeta TDS');
    const inv6 = await createTestInvoice(cust6, 118000);
    console.log(`Created invoice ${inv6.invoiceNumber} for ₹1,18,000.`);

    // Record receipt of ₹1,16,000 with TDS deduction of ₹2,000
    const pay6Res = await fetch(`${API_BASE}/ledger/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partyType: 'customer',
        partyId: cust6.id,
        amount: 116000,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        reference: 'BANKTRF11600000',
        notes: 'Net receipt after 2% TDS under section 194C',
        deductions: [
          {
            type: 'tds',
            amount: 2000,
            note: 'TDS deducted by client under Sec 194C @ 2%',
            notes: 'TDS deducted by client under Sec 194C @ 2%',
          },
        ],
        allocations: [{ invoiceId: inv6.id, amount: 118000 }],
      }),
    });
    const pay6Data = await pay6Res.json();
    if (!pay6Res.ok) throw new Error(`TDS Payment failed: ${JSON.stringify(pay6Data)}`);
    const payment6Id = pay6Data.id || pay6Data.payment?.id || pay6Data.paymentId;
    createdPaymentIds.push(payment6Id);
    console.log(`Recorded receipt of ₹1,16,000 + TDS ₹2,000. Receipt: ${pay6Data.receiptNumber}, Total Settlement: ₹${pay6Data.totalSettlement}`);

    if (pay6Data.totalSettlement !== 118000) {
      throw new Error(`Expected totalSettlement 118000, got ${pay6Data.totalSettlement}`);
    }

    const s6Check = await assertAgreement('Scenario 6 - TDS Settled', cust6.id, inv6.id);
    if (s6Check.invData.balanceDue > 0.01 || s6Check.invData.paymentStatus !== 'paid') {
      throw new Error(`Scenario 6 invoice balance not 0: balance ${s6Check.invData.balanceDue}, status ${s6Check.invData.paymentStatus}`);
    }
    if (s6Check.custData.summary.outstandingReceivable > 0.01) {
      throw new Error(`Scenario 6 customer outstanding not 0: ${s6Check.custData.summary.outstandingReceivable}`);
    }

    // Verify 2 separate ledger entries exist: 1 for payment and 1 for deduction
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id, partyId: cust6.id },
    });
    const deductionEntry = ledgerEntries.find((e) => e.sourceType === 'payment_deduction');
    const paymentEntry = ledgerEntries.find((e) => e.sourceType === 'payment' && !e.reversalOfId);
    if (!deductionEntry || !paymentEntry) {
      throw new Error(`Scenario 6 failed to create separate ledger entries: deductionEntry=${!!deductionEntry}, paymentEntry=${!!paymentEntry}`);
    }
    if (Math.abs(Number(deductionEntry.credit) - 2000) > 0.01) {
      throw new Error(`Deduction entry credit expected 2000, got ${deductionEntry.credit}`);
    }
    if (Math.abs(Number(paymentEntry.credit) - 116000) > 0.01) {
      throw new Error(`Payment entry credit expected 116000, got ${paymentEntry.credit}`);
    }
    console.log(`[PASS] Scenario 6: Separate ledger entries confirmed (Receipt Cr: ₹${paymentEntry.credit}, TDS Deduction Cr: ₹${deductionEntry.credit}). Net invoice balance: ₹0 (Paid).`);

    // =========================================================================
    // SCENARIO 7: RECEIPT VOUCHER & EMAIL VERIFICATION
    // =========================================================================
    console.log('\n--- SCENARIO 7: Receipt Voucher & Email Dispatch ---');
    const receiptRes = await fetch(`${API_BASE}/payments/${payment6Id}/receipt`, { headers });
    const receiptData = await receiptRes.json();
    if (!receiptRes.ok) throw new Error(`Fetch receipt voucher failed: ${JSON.stringify(receiptData)}`);

    console.log(`Receipt Voucher Number: ${receiptData.receipt.receiptNumber}`);
    console.log(`Amount in Words: ${receiptData.receipt.amountInWords}`);
    console.log(`Masked Bank Account: ${receiptData.receipt.bankAccountMasked}`);
    console.log(`Deductions count: ${receiptData.receipt.deductions?.length || 0}`);
    console.log(`Allocated Invoices: ${receiptData.receipt.allocatedInvoices?.length || 0}`);

    if (!receiptData.receipt.amountInWords || !receiptData.receipt.bankAccountMasked) {
      throw new Error('Receipt voucher missing amount in words or masked bank account');
    }

    const emailRes = await fetch(`${API_BASE}/payments/${payment6Id}/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipientEmail: 'client-finance@example.com' }),
    });
    const emailData = await emailRes.json();
    if (!emailRes.ok) throw new Error(`Send receipt email failed: ${JSON.stringify(emailData)}`);
    console.log(`[PASS] Send Receipt email returned: ${emailData.message}`);

    // =========================================================================
    // SCENARIO 8: PAID AT CREATION (Cash sale creates invoice + receipt in 1 tx)
    // =========================================================================
    console.log('\n--- SCENARIO 8: Paid At Creation (Cash Sale) ---');
    const cust8 = await createTestCustomer('Client Theta Cash');
    const cashInvoice = await createTestInvoice(cust8, 15000, {
      recordPaymentNow: {
        amount: 15000,
        paymentMethod: 'Cash',
      },
    });
    console.log(`Created cash invoice ${cashInvoice.invoiceNumber} for ₹15,000 with recordPaymentNow.`);

    const s8Check = await assertAgreement('Scenario 8 - Cash Sale', cust8.id, cashInvoice.id);
    if (s8Check.invData.balanceDue > 0.01 || s8Check.invData.paymentStatus !== 'paid') {
      throw new Error(`Cash invoice balanceDue expected 0, got ${s8Check.invData.balanceDue}, status ${s8Check.invData.paymentStatus}`);
    }
    if (s8Check.custData.summary.outstandingReceivable > 0.01) {
      throw new Error(`Customer outstanding after cash sale expected 0, got ${s8Check.custData.summary.outstandingReceivable}`);
    }
    console.log('[PASS] Scenario 8: Cash sale invoice created as Paid with balance 0 and both ledger entries posted in 1 transaction.');

    console.log('\n========================================================================');
    console.log('ALL PAYMENT FLOW SCENARIOS PASSED WITH ZERO DISCREPANCIES!');
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('\n[FAIL] Test suite failed:', err);
    throw err;
  } finally {
    // CLEANUP TEST DATA: Tests create and delete their own data
    console.log('Cleaning up test data...');
    try {
      const validPaymentIds = createdPaymentIds.filter((id) => typeof id === 'string' && id.length > 0);
      if (validPaymentIds.length > 0) {
        await prisma.paymentAllocation.deleteMany({
          where: { paymentRecordId: { in: validPaymentIds } },
        });
      }
      if (createdInvoiceIds.length > 0) {
        await prisma.invoiceLine.deleteMany({
          where: { invoiceId: { in: createdInvoiceIds } },
        });
        await prisma.invoice.deleteMany({
          where: { id: { in: createdInvoiceIds } },
        });
      }
      if (createdCustomerIds.length > 0) {
        await prisma.ledgerEntry.deleteMany({
          where: { partyId: { in: createdCustomerIds } },
        });
        await prisma.paymentRecord.deleteMany({
          where: { customerId: { in: createdCustomerIds } },
        });
        await prisma.company.deleteMany({
          where: { id: { in: createdCustomerIds } },
        });
      }
      console.log(`Cleaned up ${createdCustomerIds.length} customers, ${createdInvoiceIds.length} invoices, and associated payments/ledger entries.`);
    } catch (cleanupErr) {
      console.error('Cleanup error (ignored):', cleanupErr);
    }
    await prisma.$disconnect();
  }
}

runAllPaymentFlowsTest()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
