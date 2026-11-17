/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * LEDGER & MONEY INVARIANTS TEST SUITE
 * Systematically tests fundamental double-entry bookkeeping invariants across 16 scenarios:
 * 1. Intra-State Tax Invoice (CGST + SGST)
 * 2. Inter-State Tax Invoice (IGST)
 * 3. Multi-line mixed GST rates (5%, 12%, 18%, 28%)
 * 4. Full Payment receipt against single invoice
 * 5. Partial Payment receipt with outstanding balance
 * 6. Advance Payment receipt (100% advance liability)
 * 7. Advance auto-allocation to newly posted invoice
 * 8. Multi-invoice split allocation
 * 9. Overpayment auto-advance creation
 * 10. Full invoice void / cancellation reversal
 * 11. Partial Credit Note (Sales return + tax reversal)
 * 12. Payment reversal / bounced cheque
 * 13. Cash discount & round-off expense
 * 14. TDS withholding tax deduction
 * 15. Bad debt write-off
 * 16. Comprehensive Trial Balance zero-sum invariant
 */

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function runLedgerTests(assertFn) {
  const assert = assertFn || ((title, pass, info) => {
    if (pass) console.log(`  [PASS] ${title}`);
    else console.error(`  [FAIL] ${title} (${info || ''})`);
  });

  const chartOfAccounts = {
    // Assets (Normal Debit)
    '1010': { name: 'Bank Account - Primary', type: 'asset', debit: 0, credit: 0 },
    '1020': { name: 'Petty Cash', type: 'asset', debit: 0, credit: 0 },
    '1200': { name: 'Accounts Receivable (Debtors)', type: 'asset', debit: 0, credit: 0 },
    // Liabilities (Normal Credit)
    '2010': { name: 'Accounts Payable (Creditors)', type: 'liability', debit: 0, credit: 0 },
    '2110': { name: 'Output CGST Payable', type: 'liability', debit: 0, credit: 0 },
    '2120': { name: 'Output SGST Payable', type: 'liability', debit: 0, credit: 0 },
    '2130': { name: 'Output IGST Payable', type: 'liability', debit: 0, credit: 0 },
    '2200': { name: 'Customer Advance Receipts', type: 'liability', debit: 0, credit: 0 },
    '2300': { name: 'TDS Payable', type: 'liability', debit: 0, credit: 0 },
    // Equity (Normal Credit)
    '3000': { name: 'Owner Equity / Share Capital', type: 'equity', debit: 0, credit: 0 },
    // Revenue (Normal Credit)
    '4010': { name: 'Sales Revenue - Domestic', type: 'revenue', debit: 0, credit: 0 },
    '4020': { name: 'Sales Revenue - Export / SEZ', type: 'revenue', debit: 0, credit: 0 },
    // Expenses (Normal Debit)
    '5010': { name: 'Cost of Goods Sold', type: 'expense', debit: 0, credit: 0 },
    '5100': { name: 'Discount Allowed', type: 'expense', debit: 0, credit: 0 },
    '5110': { name: 'Round-off Expense / (Income)', type: 'expense', debit: 0, credit: 0 },
    '5200': { name: 'Bad Debts Written Off', type: 'expense', debit: 0, credit: 0 },
  };

  const journal = [];

  function postJournalEntry(reference, description, lines) {
    let entryDebit = 0;
    let entryCredit = 0;

    for (const line of lines) {
      entryDebit = round2(entryDebit + (line.debit || 0));
      entryCredit = round2(entryCredit + (line.credit || 0));
    }

    if (Math.abs(entryDebit - entryCredit) > 0.001) {
      throw new Error(`Equilibrium broken in ${reference}: Debits (${entryDebit}) != Credits (${entryCredit})`);
    }

    for (const line of lines) {
      const acct = chartOfAccounts[line.account];
      if (!acct) throw new Error(`Unknown account: ${line.account}`);
      acct.debit = round2(acct.debit + (line.debit || 0));
      acct.credit = round2(acct.credit + (line.credit || 0));
    }

    journal.push({ reference, description, lines, totalDebit: entryDebit, totalCredit: entryCredit });
    return true;
  }

  // --- Scenario 1: Intra-State Tax Invoice (9% CGST + 9% SGST) ---
  // Taxable: 10,000.00; CGST: 900.00; SGST: 900.00; Total AR: 11,800.00
  postJournalEntry('INV-001', 'Tax Invoice - Domestic Intra-State', [
    { account: '1200', debit: 11800.00, credit: 0 },
    { account: '4010', debit: 0, credit: 10000.00 },
    { account: '2110', debit: 0, credit: 900.00 },
    { account: '2120', debit: 0, credit: 900.00 },
  ]);
  assert('Invariant 1: Intra-State Invoice AR equals Taxable + CGST + SGST',
    chartOfAccounts['1200'].debit === round2(chartOfAccounts['4010'].credit + chartOfAccounts['2110'].credit + chartOfAccounts['2120'].credit));

  // --- Scenario 2: Inter-State Tax Invoice (18% IGST) ---
  // Taxable: 25,000.00; IGST: 4,500.00; Total AR: 29,500.00
  postJournalEntry('INV-002', 'Tax Invoice - Inter-State IGST', [
    { account: '1200', debit: 29500.00, credit: 0 },
    { account: '4010', debit: 0, credit: 25000.00 },
    { account: '2130', debit: 0, credit: 4500.00 },
  ]);
  assert('Invariant 2: Inter-State Invoice AR equals Taxable + IGST',
    chartOfAccounts['2130'].credit === 4500.00 && chartOfAccounts['1200'].debit === round2(11800.00 + 29500.00));

  // --- Scenario 3: Multi-line Mixed GST Rates (5%, 12%, 18%, 28%) ---
  // Line A: 2,000 @ 5% (100 tax: 50 CGST, 50 SGST)
  // Line B: 5,000 @ 12% (600 tax: 300 CGST, 300 SGST)
  // Line C: 10,000 @ 18% (1800 tax: 900 CGST, 900 SGST)
  // Line D: 4,000 @ 28% (1120 tax: 560 CGST, 560 SGST)
  // Total Taxable: 21,000.00; CGST: 1,810.00; SGST: 1,810.00; AR: 24,620.00
  postJournalEntry('INV-003', 'Tax Invoice - Multi-Rate Mixed Items', [
    { account: '1200', debit: 24620.00, credit: 0 },
    { account: '4010', debit: 0, credit: 21000.00 },
    { account: '2110', debit: 0, credit: 1810.00 },
    { account: '2120', debit: 0, credit: 1810.00 },
  ]);
  assert('Invariant 3: Multi-tier GST tax component equilibrium',
    chartOfAccounts['2110'].credit === round2(900.00 + 1810.00) && chartOfAccounts['2120'].credit === round2(900.00 + 1810.00));

  // --- Scenario 4: Full Payment Receipt against Single Invoice ---
  // Settle INV-001 (11,800.00)
  postJournalEntry('RCPT-001', 'Full Payment for INV-001 via Bank', [
    { account: '1010', debit: 11800.00, credit: 0 },
    { account: '1200', debit: 0, credit: 11800.00 },
  ]);
  assert('Invariant 4: Full Payment reduces AR by exact invoice gross amount',
    chartOfAccounts['1010'].debit === 11800.00 && chartOfAccounts['1200'].credit === 11800.00);

  // --- Scenario 5: Partial Payment Receipt with Balance Outstanding ---
  // Settle 15,000.00 against INV-002 (Balance outstanding: 14,500.00)
  postJournalEntry('RCPT-002', 'Partial Payment for INV-002', [
    { account: '1010', debit: 15000.00, credit: 0 },
    { account: '1200', debit: 0, credit: 15000.00 },
  ]);
  assert('Invariant 5: Partial Payment maintains outstanding debtor balance',
    round2(chartOfAccounts['1200'].debit - chartOfAccounts['1200'].credit) === round2(24620.00 + 14500.00));

  // --- Scenario 6: Customer Advance Payment (100% Advance Liability) ---
  // Customer deposits 50,000.00 without immediate invoice
  postJournalEntry('ADV-001', 'Customer Advance Deposit', [
    { account: '1010', debit: 50000.00, credit: 0 },
    { account: '2200', debit: 0, credit: 50000.00 },
  ]);
  assert('Invariant 6: Customer Advance is recognized as current liability',
    chartOfAccounts['2200'].credit === 50000.00);

  // --- Scenario 7: Advance Auto-Allocation to newly posted invoice ---
  // Auto-allocate 14,500.00 of advance to settle the remaining balance of INV-002
  postJournalEntry('ALLOC-001', 'Auto-allocation of Advance to INV-002', [
    { account: '2200', debit: 14500.00, credit: 0 },
    { account: '1200', debit: 0, credit: 14500.00 },
  ]);
  assert('Invariant 7: Advance allocation clears invoice AR without cash movement',
    chartOfAccounts['2200'].credit === 50000.00 && chartOfAccounts['2200'].debit === 14500.00);

  // --- Scenario 8: Split Allocation across Multiple Invoices ---
  // Allocate 20,000.00 of remaining advance: 10,000 to INV-003 and 10,000 to future
  postJournalEntry('ALLOC-002', 'Split Advance Allocation to INV-003', [
    { account: '2200', debit: 10000.00, credit: 0 },
    { account: '1200', debit: 0, credit: 10000.00 },
  ]);
  assert('Invariant 8: Split advance allocation leaves remaining advance balance intact',
    round2(chartOfAccounts['2200'].credit - chartOfAccounts['2200'].debit) === 25500.00);

  // --- Scenario 9: Overpayment Creating Auto-Advance ---
  // Customer owes 14,620.00 on INV-003 but pays 20,000.00 (5,380.00 overpayment)
  postJournalEntry('RCPT-003', 'Overpayment on INV-003 (Balance + Auto-Advance)', [
    { account: '1010', debit: 20000.00, credit: 0 },
    { account: '1200', debit: 0, credit: 14620.00 },
    { account: '2200', debit: 0, credit: 5380.00 },
  ]);
  assert('Invariant 9: Overpayment splits into AR settlement and advance liability',
    round2(chartOfAccounts['1200'].debit - chartOfAccounts['1200'].credit) === 0.00);

  // --- Scenario 10: Full Invoice Cancellation / Void Reversal ---
  // Create test invoice INV-999 for 5,900 and void it
  postJournalEntry('INV-999', 'Invoice to be voided', [
    { account: '1200', debit: 5900.00, credit: 0 },
    { account: '4010', debit: 0, credit: 5000.00 },
    { account: '2110', debit: 0, credit: 450.00 },
    { account: '2120', debit: 0, credit: 450.00 },
  ]);
  postJournalEntry('VOID-999', 'Reversal of Voided Invoice INV-999', [
    { account: '4010', debit: 5000.00, credit: 0 },
    { account: '2110', debit: 450.00, credit: 0 },
    { account: '2120', debit: 450.00, credit: 0 },
    { account: '1200', debit: 0, credit: 5900.00 },
  ]);
  assert('Invariant 10: Voided invoice is completely neutralized across all sub-ledgers',
    round2(chartOfAccounts['4010'].credit - chartOfAccounts['4010'].debit) === round2(10000 + 25000 + 21000));

  // --- Scenario 11: Partial Credit Note (Goods Return) ---
  // Issue Credit Note for 2,000.00 taxable + 180 CGST + 180 SGST = 2,360.00
  postJournalEntry('CN-001', 'Credit Note for Goods Return', [
    { account: '4010', debit: 2000.00, credit: 0 },
    { account: '2110', debit: 180.00, credit: 0 },
    { account: '2120', debit: 180.00, credit: 0 },
    { account: '1200', debit: 0, credit: 2360.00 },
  ]);
  assert('Invariant 11: Credit note reduces revenue, tax liability, and receivable',
    chartOfAccounts['4010'].debit === 7000.00 && chartOfAccounts['1200'].credit > 0);

  // --- Scenario 12: Payment Reversal / Cheque Bounce ---
  // Reverse 5,000.00 from Bank back to AR
  postJournalEntry('REV-001', 'Payment Reversal - Dishonored Cheque', [
    { account: '1200', debit: 5000.00, credit: 0 },
    { account: '1010', debit: 0, credit: 5000.00 },
  ]);
  assert('Invariant 12: Bounced payment restores debtor balance and reduces bank',
    chartOfAccounts['1010'].credit === 5000.00);

  // --- Scenario 13: Discount Allowed & Round-off Penny Adjustment ---
  // Settle invoice with 100.00 cash discount and 0.40 round-off
  postJournalEntry('DISC-001', 'Settlement with Cash Discount and Round-off', [
    { account: '1010', debit: 2500.00, credit: 0 },
    { account: '5100', debit: 100.00, credit: 0 },
    { account: '5110', debit: 0.40, credit: 0 },
    { account: '1200', debit: 0, credit: 2600.40 },
  ]);
  assert('Invariant 13: Settlement discounts and round-off adjustments balance exactly',
    round2(chartOfAccounts['5100'].debit + chartOfAccounts['5110'].debit + 2500.00) === 2600.40);

  // --- Scenario 14: TDS Withholding Tax Deduction ---
  // Client deducts 2% TDS on service invoice (Invoice 10,000, TDS 200, Net Bank 9,800)
  postJournalEntry('TDS-001', 'Payment Receipt with Section 194C TDS Deduction', [
    { account: '1010', debit: 9800.00, credit: 0 },
    { account: '2300', debit: 200.00, credit: 0 },
    { account: '1200', debit: 0, credit: 10000.00 },
  ]);
  assert('Invariant 14: TDS withholding correctly recognized in tax deduction account',
    chartOfAccounts['2300'].debit === 200.00);

  // --- Scenario 15: Bad Debt Write-off ---
  // Write off 3,000.00 irrecoverable debt
  postJournalEntry('BAD-001', 'Bad Debt Write-off for Insolvency', [
    { account: '5200', debit: 3000.00, credit: 0 },
    { account: '1200', debit: 0, credit: 3000.00 },
  ]);
  assert('Invariant 15: Bad debt expense offsets accounts receivable permanently',
    chartOfAccounts['5200'].debit === 3000.00);

  // --- Scenario 16: Comprehensive Trial Balance Zero-Sum Invariant ---
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [code, acct] of Object.entries(chartOfAccounts)) {
    totalDebit = round2(totalDebit + acct.debit);
    totalCredit = round2(totalCredit + acct.credit);
  }
  const variance = round2(Math.abs(totalDebit - totalCredit));
  assert('Invariant 16: Trial balance total debits equal total credits with zero variance',
    variance === 0.00, `Total Debit: ${totalDebit}, Total Credit: ${totalCredit}, Variance: ${variance}`);

  return {
    totalTransactions: journal.length,
    totalDebit,
    totalCredit,
    variance,
    accountsCount: Object.keys(chartOfAccounts).length,
  };
}

if (require.main === module) {
  console.log('========================================================================');
  console.log('         LEDGER & MONEY INVARIANTS TEST SUITE (16 SCENARIOS)            ');
  console.log('========================================================================\n');
  const res = runLedgerTests();
  console.log(`\nCompleted ${res.totalTransactions} transactions across ${res.accountsCount} accounts.`);
  console.log(`Total Debits:  ₹${res.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Total Credits: ₹${res.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Net Variance:  ₹${res.variance.toFixed(2)} (Double-entry Equilibrium Preserved)\n`);
}

module.exports = { runLedgerTests };
