import * as assert from 'assert';
import { PrismaClient } from '@prisma/client';

interface ReconciliationResponse {
  status: string;
  reconciled: boolean;
  totalReceivable: number;
  totalPayable: number;
  customers: Array<{
    partyId: string;
    partyName: string;
    ledgerBalance: number;
    balanceSide: string;
    unpaidInvoicesSum: number;
    unallocatedCreditNotesSum: number;
    unallocatedAdvances: number;
    netDocumentBalance: number;
    discrepancy: number;
    isReconciled: boolean;
    unpaidInvoicesCount: number;
  }>;
  suppliers: Array<{
    partyId: string;
    partyName: string;
    ledgerBalance: number;
    balanceSide: string;
    unpaidBillsSum: number;
    unallocatedSupplierAdvances: number;
    netBillsBalance: number;
    discrepancy: number;
    isReconciled: boolean;
    unpaidBillsCount: number;
  }>;
}

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('RECONCILIATION & DASHBOARD INTEGRITY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Authenticate as Company Administrator
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL || 'admin@example.com',
      password: process.env.TEST_PASSWORD || 'SecurePass123!',
    }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }
  const loginData: any = await loginRes.json();
  const accessToken = loginData.accessToken;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // 2. Query Reconciliation Endpoint
  const recRes = await fetch(`${BASE_URL}/ledger/reconciliation`, {
    headers: authHeaders,
  });
  if (!recRes.ok) {
    throw new Error(`Reconciliation endpoint failed: ${recRes.status} ${await recRes.text()}`);
  }
  const recData = (await recRes.json()) as ReconciliationResponse;

  console.log(`[RECONCILIATION] Overall Status: ${recData.status} | Reconciled: ${recData.reconciled}`);
  console.log(`[RECONCILIATION] Total Customer Receivable: ₹${recData.totalReceivable.toLocaleString('en-IN')}`);
  console.log(`[RECONCILIATION] Total Supplier Payable:    ₹${recData.totalPayable.toLocaleString('en-IN')}\n`);

  let failureCount = 0;

  // 3. Customer Reconciliation Checks
  console.log('--- CUSTOMER RECONCILIATION CHECK (Ledger Closing == Open Doc Balances) ---');
  let sumCustomerLedgers = 0;
  let sumCustomerOpenDocs = 0;
  for (const c of recData.customers) {
    const statusStr = c.isReconciled ? '✓ RECONCILED' : '✗ DISCREPANCY';
    console.log(`  [${statusStr}] ${c.partyName}: Ledger=${c.ledgerBalance} ${c.balanceSide} | NetDocs=${c.netDocumentBalance} | Diff=${c.discrepancy}`);
    if (!c.isReconciled) {
      console.error(`    FAILED: Customer "${c.partyName}" ledger balance (${c.ledgerBalance}) does not equal net open document balance (${c.netDocumentBalance}). Discrepancy: ${c.discrepancy}`);
      failureCount++;
    }
    if (c.balanceSide === 'Dr') {
      sumCustomerLedgers += c.ledgerBalance;
      sumCustomerOpenDocs += c.netDocumentBalance;
    }
  }

  // 4. Supplier Reconciliation Checks
  console.log('\n--- SUPPLIER RECONCILIATION CHECK ---');
  for (const s of recData.suppliers) {
    const statusStr = s.isReconciled ? '✓ RECONCILED' : '✗ DISCREPANCY';
    console.log(`  [${statusStr}] ${s.partyName}: Ledger=${s.ledgerBalance} ${s.balanceSide} | NetDocs=${s.netBillsBalance} | Diff=${s.discrepancy}`);
    if (!s.isReconciled) {
      console.error(`    FAILED: Supplier "${s.partyName}" ledger balance (${s.ledgerBalance}) does not equal net unpaid bills balance (${s.netBillsBalance}). Discrepancy: ${s.discrepancy}`);
      failureCount++;
    }
  }

  // 5. Specific Verification for Customer A (Authoritative Fixture: 1,61,498 Dr)
  console.log('\n--- CUSTOMER A SPECIFIC RECONCILIATION ---');
  const custA = recData.customers.find((c) => c.partyName.includes('Customer A'));
  if (!custA) {
    console.error('FAILED: Customer A not found in reconciliation response.');
    failureCount++;
  } else {
    console.log(`  Customer A Ledger Balance: ${custA.ledgerBalance} ${custA.balanceSide}`);
    console.log(`  Customer A Net Document Balance: ${custA.netDocumentBalance}`);
    console.log(`  Customer A Unpaid Invoices Count: ${custA.unpaidInvoicesCount}`);
    assert.strictEqual(custA.ledgerBalance, 161498, 'Customer A ledger balance must be 1,61,498');
    assert.strictEqual(custA.netDocumentBalance, 161498, 'Customer A net document balance must be 1,61,498');
    assert.strictEqual(custA.unpaidInvoicesCount, 4, 'Customer A must have exactly 4 unpaid invoices');
    console.log('  ✓ Customer A ledger closing balance matches open document balance of ₹1,61,498 exactly (INV 003 ₹1,180 + INV 001 ₹38,651 + INV 002 ₹8,225 + INV 003 ₹1,13,442).');
  }

  // 6. Query Invoices API to verify open invoice balances
  console.log('\n--- OPEN INVOICES CHECK ---');
  const invRes = await fetch(`${BASE_URL}/invoices`, { headers: authHeaders });
  if (!invRes.ok) {
    throw new Error(`Invoices endpoint failed: ${invRes.status} ${await invRes.text()}`);
  }
  const invoicesData: any = await invRes.json();
  const allInvoices: any[] = invoicesData.items || invoicesData.data || invoicesData;
  const openInvoices = allInvoices.filter(i => !i.isVoided && ['tax_invoice', 'sez_invoice'].includes(i.docType) && i.paymentStatus !== 'paid');

  let sumOpenInvoiceBalances = 0;
  for (const inv of openInvoices) {
    const bal = inv.balanceDue != null ? Number(inv.balanceDue) : Number(inv.totalAmount);
    sumOpenInvoiceBalances += bal;
    console.log(`  - Invoice ${inv.invoiceNumber}: Status=${inv.paymentStatus}, Total=₹${inv.totalAmount}, BalanceDue=₹${bal}`);
  }
  const creditNotes = allInvoices.filter(i => !i.isVoided && i.docType === 'credit_note');
  let sumCreditNotes = 0;
  for (const cn of creditNotes) {
    sumCreditNotes += Number(cn.totalAmount || 0);
  }
  const netOpenDocBalances = sumOpenInvoiceBalances - sumCreditNotes;
  console.log(`  Sum of Open Invoice Balances: ₹${sumOpenInvoiceBalances.toLocaleString('en-IN')}`);
  console.log(`  Net Open Document Balances (after CN): ₹${netOpenDocBalances.toLocaleString('en-IN')}`);

  // 7. Query Dashboard KPIs (Gross Receivable & Customer Advances)
  console.log('\n--- DASHBOARD GROSS RECEIVABLE & ADVANCES CHECK ---');
  const kpiRes = await fetch(`${BASE_URL}/dashboard/kpis`, {
    headers: authHeaders,
  });
  if (!kpiRes.ok) {
    throw new Error(`Dashboard KPIs failed: ${kpiRes.status} ${await kpiRes.text()}`);
  }
  const kpiData: any = await kpiRes.json();
  const dashboardGrossReceivable = Number(kpiData.kpis?.invoices?.totalReceivable ?? kpiData.kpis?.invoices?.unpaidAmount ?? 0);
  const dashboardCustomerAdvances = Number(kpiData.kpis?.invoices?.customerAdvances ?? 0);

  console.log(`  Dashboard Gross Receivable (Debit Balances): ₹${dashboardGrossReceivable.toLocaleString('en-IN')}`);
  console.log(`  Dashboard Customer Advances (Credit Balances): ₹${dashboardCustomerAdvances.toLocaleString('en-IN')}`);
  console.log(`  Reconciliation Total Receivable:             ₹${Number(recData.totalReceivable).toLocaleString('en-IN')}`);

  assert.strictEqual(dashboardGrossReceivable, recData.totalReceivable, 'Dashboard gross receivable must equal reconciliation total receivable');
  assert.strictEqual(dashboardGrossReceivable, sumCustomerLedgers, 'Dashboard receivable must equal sum of gross party debit balances');
  assert.strictEqual(dashboardGrossReceivable, netOpenDocBalances, 'Dashboard receivable must equal net open document balances');
  console.log('  ✓ Dashboard gross receivable == sum of party debit balances == net open document balances');

  // 8. TEST: "Opening entry plus prior-year entries" rejection test
  console.log('\n--- TEST A: REJECTION OF OPENING ENTRY WHEN PRIOR-YEAR ENTRIES EXIST ---');
  const custAObj = recData.customers.find((c) => c.partyName.includes('Customer A'));
  assert.ok(custAObj, 'Customer A must exist');

  const rejectObRes = await fetch(`${BASE_URL}/ledger/entries`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partyType: 'customer',
      partyId: custAObj.partyId,
      entryDate: '2026-04-01T00:00:00.000Z',
      financialYear: '26-27',
      voucherType: 'opening',
      debit: 50000,
      credit: 0,
      particulars: 'Illegal opening balance injection test',
      confirmOpening: true,
    }),
  });

  const rejectObData: any = await rejectObRes.json();
  assert.strictEqual(rejectObRes.status, 400, 'Must reject opening entry with HTTP 400 when prior-year entries exist');
  assert(
    rejectObData.message?.includes('prior financial years already have transactions') ||
    rejectObData.message?.includes('carry-forward'),
    `Expected prior-year carry-forward rejection message, got: ${rejectObData.message}`
  );
  console.log(`  ✓ Successfully rejected invalid opening balance entry with HTTP 400: "${rejectObData.message}"`);

  // 9. TEST: "Reversed opening gives 0" test
  console.log('\n--- TEST B: REVERSED OPENING ENTRY GIVES ZERO OPENING BALANCE ---');
  // Create isolated temporary company
  const tempCompRes = await fetch(`${BASE_URL}/companies`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Test Reversed OB Co ${Date.now()}`,
      billingEmail: `rev-ob-${Date.now()}@example.test`,
      city: 'Bengaluru',
      state: 'Karnataka',
    }),
  });
  assert.strictEqual(tempCompRes.status, 201, 'Temporary company creation must return 201');
  const tempCompJson = await tempCompRes.json();
  const tempComp = tempCompJson.data || tempCompJson;
  const tempCompId = tempComp.id;

  try {
    // Post opening balance of ₹50,000 Dr
    const createObRes = await fetch(`${BASE_URL}/ledger/entries`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partyType: 'customer',
        partyId: tempCompId,
        entryDate: '2026-04-01T00:00:00.000Z',
        financialYear: '26-27',
        voucherType: 'opening',
        debit: 50000,
        credit: 0,
        particulars: 'Test opening balance to be reversed',
        confirmOpening: true,
      }),
    });
    assert.strictEqual(createObRes.status, 201, 'Opening balance entry creation must return 201');
    const obEntry = await createObRes.json();
    const obEntryId = obEntry.id || obEntry.data?.id;

    // Check statement BEFORE reversal: opening balance must be 50,000 Dr
    const stmtBeforeRes = await fetch(`${BASE_URL}/ledger/statement?partyType=customer&partyId=${tempCompId}&financialYear=26-27`, {
      headers: authHeaders,
    });
    const stmtBefore = await stmtBeforeRes.json();
    const obBeforeAmt = typeof stmtBefore.openingBalance === 'number' ? stmtBefore.openingBalance : stmtBefore.openingBalance?.amount;
    assert.strictEqual(obBeforeAmt, 50000, 'Opening balance before reversal must be 50,000');

    // Reverse the opening entry
    const revRes = await fetch(`${BASE_URL}/ledger/entries/${obEntryId}/reverse`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Reversing test opening balance to verify zero rule',
      }),
    });
    assert.strictEqual(revRes.status, 201, 'Reversal of opening entry must return 201');

    // Check statement AFTER reversal: opening balance b/f must be 0!
    const stmtAfterRes = await fetch(`${BASE_URL}/ledger/statement?partyType=customer&partyId=${tempCompId}&financialYear=26-27`, {
      headers: authHeaders,
    });
    const stmtAfter = await stmtAfterRes.json();
    const obAfterAmt = typeof stmtAfter.openingBalance === 'number' ? stmtAfter.openingBalance : stmtAfter.openingBalance?.amount;
    assert.strictEqual(obAfterAmt, 0, 'Opening balance after reversal must be exactly 0');
    console.log('  ✓ Reversing opening entry successfully resets opening balance b/f to ₹0.00');

    // 10. TEST: Credit Note on a Fully Paid Invoice
    console.log('\n--- TEST C: CREDIT NOTE ON FULLY PAID INVOICE (CUSTOMER CREDIT BALANCE) ---');
    // Create an invoice of ₹10,000 for tempComp
    const paidInvRes = await fetch(`${BASE_URL}/invoices/create-direct`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: tempCompId,
        customerId: tempCompId,
        customerName: tempComp.name,
        invoiceDate: '2026-10-20',
        dueDate: '2026-11-20',
        docType: 'tax_invoice',
        items: [{ description: 'Fully paid test service', quantity: 1, unitPrice: 8474.58, taxRate: 18 }], // total ₹10,000
      }),
    });
    assert.strictEqual(paidInvRes.status, 201, 'Invoice creation must return 201');
    const paidInvJson = await paidInvRes.json();
    const paidInv = paidInvJson.data || paidInvJson;

    // Fully pay the invoice
    const payRecRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partyType: 'customer',
        partyId: tempCompId,
        amount: paidInv.totalAmount,
        paymentDate: '2026-10-21T10:00:00.000Z',
        paymentMode: 'NEFT',
        transactionRef: `FULL-PAY-${Date.now().toString().slice(-6)}`,
        notes: 'Full payment of invoice',
        allocations: [{ invoiceId: paidInv.id, amount: paidInv.totalAmount }],
      }),
    });
    assert.strictEqual(payRecRes.status, 201, 'Full payment must return 201');

    // Now create a Credit Note of ₹2,000 against this fully paid invoice
    // Under the corrected cap (invoice total minus earlier credit notes = 10,000 - 0 = 10,000), 2,000 is permitted!
    const cnRes = await fetch(`${BASE_URL}/invoices/create-direct`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: tempCompId,
        customerId: tempCompId,
        customerName: tempComp.name,
        invoiceDate: '2026-10-22',
        docType: 'credit_note',
        referenceNo: paidInv.invoiceNumber,
        items: [{ description: 'Return credit adjustment', quantity: 1, unitPrice: 1694.92, taxRate: 18 }], // total ₹2,000
      }),
    });
    assert.strictEqual(cnRes.status, 201, 'Credit note on fully paid invoice must be accepted with HTTP 201');
    const cnJson = await cnRes.json();
    const cnData = cnJson.data || cnJson;
    console.log(`  ✓ Credit note ${cnData.invoiceNumber} (₹${cnData.totalAmount}) created against fully paid invoice ${paidInv.invoiceNumber}`);

    // Verify that the credit note date cannot precede invoice date
    const invalidDateCnRes = await fetch(`${BASE_URL}/invoices/create-direct`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: tempCompId,
        customerId: tempCompId,
        customerName: tempComp.name,
        invoiceDate: '2026-10-15', // Precedes 2026-10-20!
        docType: 'credit_note',
        referenceNo: paidInv.invoiceNumber,
        items: [{ description: 'Invalid date credit note', quantity: 1, unitPrice: 500, taxRate: 18 }],
      }),
    });
    assert.strictEqual(invalidDateCnRes.status, 400, 'Credit note with date prior to invoice date must be rejected with HTTP 400');
    console.log('  ✓ Credit note with date preceding invoice date rejected with HTTP 400');

    // Verify that customer ledger statement now ends with a credit balance
    const stmtCnRes = await fetch(`${BASE_URL}/ledger/statement?partyType=customer&partyId=${tempCompId}&financialYear=26-27`, {
      headers: authHeaders,
    });
    const stmtCn = await stmtCnRes.json();
    assert.strictEqual(stmtCn.totals.closingSide, 'Cr', 'Customer ledger must end in credit balance (Cr)');
    assert.strictEqual(Number(stmtCn.totals.closingBalance), 2000, 'Customer credit balance must be exactly ₹2,000 Cr');
    console.log(`  ✓ Customer ledger verified: ends in credit balance of ₹${stmtCn.totals.closingBalance} ${stmtCn.totals.closingSide}`);
  } finally {
    // Always cleanly remove temporary company test artifacts
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev' } }
    });
    await prisma.ledgerEntry.deleteMany({ where: { partyId: tempCompId } });
    await prisma.paymentAllocation.deleteMany({ where: { invoice: { companyId: tempCompId } } });
    await prisma.invoice.deleteMany({ where: { companyId: tempCompId } });
    await prisma.paymentRecord.deleteMany({ where: { customerId: tempCompId } });
    await prisma.company.delete({ where: { id: tempCompId } });
    await prisma.$disconnect();
    console.log('  ✓ Cleaned up temporary test company and entries.');
  }

  // Final Verdict
  console.log('\n========================================================================');
  if (failureCount > 0) {
    console.error(`RECONCILIATION TEST FAILED WITH ${failureCount} DISCREPANCIES. FAILING BUILD.`);
    process.exit(1);
  } else {
    console.log('ALL RECONCILIATION CHECKS PASSED PERFECTLY. ZERO DISCREPANCIES.');
    console.log('========================================================================');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal reconciliation error:', err);
  process.exit(1);
});
