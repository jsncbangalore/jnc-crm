import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
const pdfParse = require('pdf-parse');
const { chromium } = require('playwright');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3333/api/v1';

async function main() {
  console.log('========================================================================');
  console.log('PARTY LEDGER INTEGRITY, EXACT OMNI RETAIL CASE & PDF VERIFICATION');
  console.log('========================================================================\n');

  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public' }
    }
  });

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
  const { accessToken } = await loginRes.json();
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // 2. Query all parties
  const partiesRes = await fetch(`${BASE_URL}/ledger/parties?type=all`, { headers: authHeaders });
  assert.ok(partiesRes.ok, 'Failed to fetch parties');
  const parties = await partiesRes.json();
  console.log(`Fetched ${parties.length} parties from ledger.`);

  // 3. Test integrity for every party and FY
  console.log('\n--- VERIFYING RECONCILIATION INTEGRITY FOR ALL PARTIES AND FYs ---');
  let checkedCount = 0;
  for (const party of parties) {
    if (party.partyId === 'not-linked') continue;

    // Check statements across FYs
    const fysToCheck = ['25-26', '26-27'];
    let prevFyClosing: { amount: number; side: string } | null = null;

    for (const fy of fysToCheck) {
      const stmtRes = await fetch(
        `${BASE_URL}/ledger/statement?partyType=${party.partyType}&partyId=${party.partyId}&financialYear=${fy}`,
        { headers: authHeaders }
      );
      if (!stmtRes.ok) continue;
      const stmt = await stmtRes.json();

      // Rule 1: No entry counted twice & no opening entry in transaction table
      const voucherIds = new Set<string>();
      for (const entry of stmt.entries) {
        assert.ok(!voucherIds.has(entry.id), `Duplicate entry ID detected: ${entry.id}`);
        voucherIds.add(entry.id);
        assert.notStrictEqual(
          entry.voucherType,
          'opening',
          `Opening entry ${entry.voucherNo} must never appear as a transaction row in statement table!`
        );
      }

      // Rule 2: sum of rows = totals
      const sumDebits = stmt.entries.reduce((acc: number, e: any) => acc + Number(e.debit || 0), 0);
      const sumCredits = stmt.entries.reduce((acc: number, e: any) => acc + Number(e.credit || 0), 0);
      assert.strictEqual(
        Number(sumDebits.toFixed(2)),
        stmt.totals.debitTotal,
        `Debit total mismatch for ${party.partyName} in FY ${fy}: rows=${sumDebits}, totals=${stmt.totals.debitTotal}`
      );
      assert.strictEqual(
        Number(sumCredits.toFixed(2)),
        stmt.totals.creditTotal,
        `Credit total mismatch for ${party.partyName} in FY ${fy}: rows=${sumCredits}, totals=${stmt.totals.creditTotal}`
      );

      // Rule 3: closing = opening + debits - credits (for customer) or opening + credits - debits (for supplier)
      const openAmt = Number(stmt.openingBalance || 0);
      const openSide = (stmt.openingSide || 'Dr').toUpperCase();
      let expectedClosingNet = 0;

      if (party.partyType === 'customer') {
        const openNet = openSide === 'DR' ? openAmt : -openAmt;
        expectedClosingNet = openNet + sumDebits - sumCredits;
        const expectedClosingAmt = Math.abs(Number(expectedClosingNet.toFixed(2)));
        const expectedClosingSide = expectedClosingNet >= 0 ? 'Dr' : 'Cr';

        assert.strictEqual(
          stmt.totals.closingBalance,
          expectedClosingAmt,
          `Closing balance mismatch for ${party.partyName} FY ${fy}: expected ${expectedClosingAmt}, got ${stmt.totals.closingBalance}`
        );
        assert.strictEqual(
          stmt.totals.closingSide.toUpperCase(),
          expectedClosingSide.toUpperCase(),
          `Closing side mismatch for ${party.partyName} FY ${fy}`
        );
      } else {
        const openNet = openSide === 'CR' ? openAmt : -openAmt;
        expectedClosingNet = openNet + sumCredits - sumDebits;
        const expectedClosingAmt = Math.abs(Number(expectedClosingNet.toFixed(2)));
        const expectedClosingSide = expectedClosingNet >= 0 ? 'Cr' : 'Dr';

        assert.strictEqual(
          stmt.totals.closingBalance,
          expectedClosingAmt,
          `Closing balance mismatch for supplier ${party.partyName} FY ${fy}`
        );
        assert.strictEqual(
          stmt.totals.closingSide.toUpperCase(),
          expectedClosingSide.toUpperCase(),
          `Closing side mismatch for supplier ${party.partyName} FY ${fy}`
        );
      }

      // Rule 4: closing of FY n == opening of FY n+1 (when carry forward applies)
      if (prevFyClosing !== null && fy === '26-27') {
        // If no explicit opening balance override was configured for 26-27, opening must match prior closing
        const explicitOpening = await prisma.partyOpeningBalance.findUnique({
          where: {
            tenantId_partyType_partyId_financialYear: {
              tenantId: party.tenantId || stmt.party.tenantId || '55051b53-7872-430e-b700-f7e6281e9ffe',
              partyType: party.partyType,
              partyId: party.partyId,
              financialYear: '26-27',
            }
          }
        });
        if (!explicitOpening) {
          assert.strictEqual(
            stmt.openingBalance,
            prevFyClosing.amount,
            `Opening balance of FY 26-27 (${stmt.openingBalance}) does not equal closing of FY 25-26 (${prevFyClosing.amount}) for ${party.partyName}`
          );
        }
      }

      prevFyClosing = { amount: stmt.totals.closingBalance, side: stmt.totals.closingSide };
      checkedCount++;
    }
  }
  console.log(`✓ Successfully verified ${checkedCount} party statement FY slices. Zero mathematical discrepancies.`);

  // 4. Exact Omni Retail Case Verification
  console.log('\n--- EXACT TEST CASE: OMNI RETAIL VENTURES LTD (FY 26-27) ---');
  const omni = await prisma.company.findFirst({ where: { name: { contains: 'Omni Retail' } } });
  assert.ok(omni, 'Omni Retail Ventures Ltd company record not found in database');
  const tenantId = omni.tenantId;

  // Setup exact test case
  console.log('  Setting up exact test fixtures:');
  console.log('    - Authoritative Opening Balance b/f: ₹2,25,15,113.00 Dr (01-Apr-2026)');
  console.log('    - Sales Invoice Debit: ₹15,340.00');
  console.log('    - Customer Payment Credit: ₹9,440.00');
  console.log('    - Expected Closing Balance: ₹2,25,21,013.00 Dr (NOT 4,50,36,126.00 Dr)');

  // Clean up any previous test entries for Omni Retail before test
  await prisma.ledgerEntry.deleteMany({
    where: {
      tenantId,
      partyId: omni.id,
      voucherNo: { in: ['INV/26-27/0016', 'REC/26-27/0022', 'REV/26-27/0002', 'REV/26-27/0003'] }
    }
  });

  // Ensure PartyOpeningBalance is set to 22515113 Dr
  await prisma.partyOpeningBalance.upsert({
    where: {
      tenantId_partyType_partyId_financialYear: {
        tenantId,
        partyType: 'customer',
        partyId: omni.id,
        financialYear: '26-27',
      }
    },
    create: {
      tenantId,
      partyType: 'customer',
      partyId: omni.id,
      financialYear: '26-27',
      amount: new Prisma.Decimal('22515113.00'),
      side: 'dr',
    },
    update: {
      amount: new Prisma.Decimal('22515113.00'),
      side: 'dr',
    }
  });

  // Post test invoice entry (Debits: 15,340)
  const invEntry = await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: omni.id,
      entryDate: new Date('2026-08-10T10:00:00.000Z'),
      financialYear: '26-27',
      voucherType: 'sales',
      voucherNo: 'INV/26-27/0016',
      particulars: 'Sales Tax Invoice #INV/26-27/0016 - Omni Retail',
      debit: new Prisma.Decimal('15340.00'),
      credit: new Prisma.Decimal('0.00'),
      sourceType: 'invoice',
    }
  });

  // Post test receipt entry (Credits: 9,440)
  const recEntry = await prisma.ledgerEntry.create({
    data: {
      tenantId,
      partyType: 'customer',
      partyId: omni.id,
      entryDate: new Date('2026-08-25T10:00:00.000Z'),
      financialYear: '26-27',
      voucherType: 'receipt',
      voucherNo: 'REC/26-27/0022',
      particulars: 'Receipt against INV/26-27/0016 [UTR-OMNI-9440]',
      debit: new Prisma.Decimal('0.00'),
      credit: new Prisma.Decimal('9440.00'),
      sourceType: 'payment',
    }
  });

  try {
    // Query Statement via API
    const omniStmtRes = await fetch(
      `${BASE_URL}/ledger/statement?partyType=customer&partyId=${omni.id}&financialYear=26-27`,
      { headers: authHeaders }
    );
    assert.ok(omniStmtRes.ok, `Omni statement request failed: ${omniStmtRes.status}`);
    const omniStmt = await omniStmtRes.json();

    console.log('\n  [API RESPONSE VERIFICATION]');
    console.log(`    Party Name:      ${omniStmt.party.name}`);
    console.log(`    Financial Year:  ${omniStmt.financialYear}`);
    console.log(`    Opening b/f:     ₹${omniStmt.openingBalance.toLocaleString('en-IN')} ${omniStmt.openingSide}`);
    console.log(`    Total Debits:    ₹${omniStmt.totals.debitTotal.toLocaleString('en-IN')}`);
    console.log(`    Total Credits:   ₹${omniStmt.totals.creditTotal.toLocaleString('en-IN')}`);
    console.log(`    Closing Balance: ₹${omniStmt.totals.closingBalance.toLocaleString('en-IN')} ${omniStmt.totals.closingSide}`);
    console.log(`    Table Rows Count:${omniStmt.entries.length}`);

    // STRICT ASSERTIONS ON THE EXACT CASE:
    assert.strictEqual(omniStmt.openingBalance, 22515113, 'Opening balance must be exactly 2,25,15,113');
    assert.strictEqual(omniStmt.openingSide, 'Dr', 'Opening side must be Dr');
    assert.strictEqual(omniStmt.totals.debitTotal, 15340, 'Debit total must be exactly 15,340');
    assert.strictEqual(omniStmt.totals.creditTotal, 9440, 'Credit total must be exactly 9,440');
    assert.strictEqual(omniStmt.totals.closingBalance, 22521013, 'Closing balance must be exactly 2,25,21,013 (22515113 + 15340 - 9440)');
    assert.strictEqual(omniStmt.totals.closingSide, 'Dr', 'Closing side must be Dr');

    // Prove double-counting bug is eradicated:
    assert.notStrictEqual(
      omniStmt.totals.closingBalance,
      45036126,
      'CRITICAL: Closing balance must NOT be 4,50,36,126 (double-counting opening balance bug)'
    );

    // Verify table rows: opening entry is NEVER rendered as a table row
    assert.strictEqual(omniStmt.entries.length, 2, 'Statement table must contain strictly 2 transaction rows');
    const openingRowsInTable = omniStmt.entries.filter((e: any) => e.voucherType === 'opening' || e.voucherNo?.startsWith('OB'));
    assert.strictEqual(openingRowsInTable.length, 0, 'Opening entry must never appear as a transaction row in statement table');
    console.log('  ✓ EXACT CASE VALIDATED: Closing balance is ₹2,25,21,013.00 Dr. Zero double-counting.');

    // 5. PDF Generation & Text Verification
    console.log('\n--- PDF BUFFER GENERATION & TEXT CONTENT COMPARISON ---');
    const pdfRes = await fetch(
      `${BASE_URL}/ledger/statement/pdf?partyType=customer&partyId=${omni.id}&financialYear=26-27`,
      { headers: authHeaders }
    );
    assert.ok(pdfRes.ok, `PDF generation failed: ${pdfRes.status}`);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    console.log(`  Received PDF Buffer: ${pdfBuffer.length} bytes`);

    // Parse PDF text with pdf-parse
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const pdfText = textResult.text || (textResult.pages || []).map((p: any) => p.text).join('\n');

    // Save PDF artifact for inspection
    const artifactDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'omni-retail-statement.pdf'), pdfBuffer);

    // Assert required PDF content
    assert.ok(pdfText.includes('STATEMENT OF ACCOUNT / PARTY LEDGER'), 'PDF missing header title');
    assert.ok(pdfText.includes('Omni Retail Ventures Ltd'), 'PDF missing party name');
    assert.ok(pdfText.includes('Opening Balance b/f'), 'PDF missing Opening Balance b/f row');
    assert.ok(pdfText.includes('2,25,15,113.00'), 'PDF missing opening balance formatted value');
    assert.ok(pdfText.includes('15,340.00'), 'PDF missing debit formatted value');
    assert.ok(pdfText.includes('9,440.00'), 'PDF missing credit formatted value');
    assert.ok(pdfText.includes('2,25,21,013.00'), 'PDF missing closing balance formatted value');
    assert.ok(pdfText.includes('Sales Invoice'), 'PDF missing human voucher label "Sales Invoice"');
    assert.ok(pdfText.includes('Receipt'), 'PDF missing human voucher label "Receipt"');
    assert.ok(pdfText.includes('Page 1 of 1'), 'PDF missing pagination "Page 1 of 1"');
    console.log('  ✓ PDF text parsing confirmed 100% parity with API numbers, human labels, and pagination.');

    // 6. Playwright Browser Render & Cell Overflow / Clipping Assertion
    console.log('\n--- PLAYWRIGHT RENDER & ZERO CLIPPING ASSERTION ---');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Login and navigate to Ledger page
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString()
      }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const codeBtn = page.locator('button:has-text("Have a company code")');
    if (await codeBtn.isVisible().catch(() => false)) {
      await codeBtn.click();
    }
    await page.fill('#company-code-input', process.env.TEST_TENANT_CODE || 'ACME-DEV-001');
    await page.fill('#company-identifier', process.env.TEST_EMAIL || 'admin@example.com');
    await page.fill('#company-password', process.env.TEST_PASSWORD || 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to Party Ledger
    await page.goto('http://localhost:5173/ledger', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="Search"]', { timeout: 15000 });

    // Search and select Omni Retail
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill('Omni Retail');
    await page.waitForTimeout(500);

    const omniCard = page.locator('text=Omni Retail Ventures Ltd').first();
    await omniCard.click();
    await page.waitForSelector('table', { timeout: 15000 });

    // Assert that table cells do not overflow their client bounds
    const overflowErrors = await page.evaluate(() => {
      const errors: string[] = [];
      const cells = document.querySelectorAll('table td, table th');
      cells.forEach((cell: any) => {
        // Allow 3px tolerance for subpixel font rendering and border edges
        if (cell.scrollWidth > cell.clientWidth + 3) {
          errors.push(`Cell "${cell.innerText.slice(0, 30)}" clipped/overflowing: scrollWidth=${cell.scrollWidth}, clientWidth=${cell.clientWidth}`);
        }
      });
      return errors;
    });

    assert.strictEqual(
      overflowErrors.length,
      0,
      `Detected text clipping/overflow in table cells: ${overflowErrors.join('; ')}`
    );
    console.log('  ✓ Zero text clipping detected. All table cells fit completely within bounds.');

    // Take screenshot evidence
    const screenshotPath = path.join(artifactDir, 'omni-ledger-statement-verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ Saved statement screenshot evidence to ${screenshotPath}`);

    await browser.close();

  } finally {
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    await prisma.ledgerEntry.deleteMany({
      where: {
        tenantId,
        partyId: omni.id,
        voucherNo: { in: ['INV/26-27/0016', 'REC/26-27/0022', 'REV/26-27/0002', 'REV/26-27/0003'] }
      }
    });

    // Clear opening balance override
    await prisma.partyOpeningBalance.deleteMany({
      where: { tenantId, partyId: omni.id, financialYear: '26-27' }
    });
    console.log('  ✓ Test fixtures cleaned up successfully.');
  }

  await prisma.$disconnect();

  console.log('\n========================================================================');
  console.log('ALL PARTY LEDGER STATEMENT INTEGRITY CHECKS PASSED PERFECTLY!');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('\nFATAL TEST FAILURE:', err);
  process.exit(1);
});
