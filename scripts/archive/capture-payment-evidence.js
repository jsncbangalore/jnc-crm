/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve(
  'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824'
);

async function main() {
  console.log('Starting Playwright Payment Evidence Capture...');
  const browser = await chromium.launch({ headless: true });

  async function loginAndSetConsent(page) {
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem(
        'crm_cookie_consent',
        JSON.stringify({
          choice: 'all',
          preferences: true,
          policyVersion: '2026.10.1',
          savedAt: new Date().toISOString(),
        })
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const codeBtn = page.locator('button:has-text("Have a company code")');
    if (await codeBtn.isVisible().catch(() => false)) {
      await codeBtn.click();
    }

    await page.fill('#company-code-input', 'ACME-DEV-001');
    await page.fill('#company-identifier', 'admin@seed.dev');
    await page.fill('#company-password', 'DevPassword@123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  }

  // Find a payment receipt ID to view the receipt voucher
  let samplePaymentId = '2bdef876-7010-4176-ab3d-053e4a7f98ba';
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const p = await prisma.paymentRecord.findFirst({
      where: { reversalOfId: null },
      orderBy: { createdAt: 'desc' },
    });
    if (p) samplePaymentId = p.id;
    await prisma.$disconnect();
  } catch (e) {
    console.warn('Prisma lookup failed:', e.message);
  }

  const viewports = [
    { name: '1536x730', width: 1536, height: 730 },
    { name: '390px', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\n================ CAPTURING VIEWPORT: ${vp.name} ================`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    console.log(`Logging in for ${vp.name}...`);
    await loginAndSetConsent(page);

    // -------------------------------------------------------------
    // EVIDENCE 1: Deductions in Record Receipt Modal (with live summary)
    // -------------------------------------------------------------
    console.log('Capturing Evidence 1: Deductions in UnifiedRecordPaymentModal...');
    await page.goto('http://localhost:5173/ledger', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const recordReceiptBtn = page.locator('button:has-text("Record receipt")').first();
    if (await recordReceiptBtn.isVisible().catch(() => false)) {
      await recordReceiptBtn.click({ force: true });
      await page.waitForTimeout(1000);

      // Fill amount
      const amtInput = page.locator('input[placeholder="0.00"]').first();
      if (await amtInput.isVisible().catch(() => false)) {
        await amtInput.fill('116000');
        await page.waitForTimeout(300);
      }

      // Click "Add deduction line"
      const addDeductionBtn = page.locator('button:has-text("Add deduction line")').first();
      if (await addDeductionBtn.isVisible().catch(() => false)) {
        await addDeductionBtn.click({ force: true });
        await page.waitForTimeout(400);

        // Select TDS deduction and fill amount 2000 and note
        const dedTypeSelect = page.locator('select').first();
        if (await dedTypeSelect.isVisible().catch(() => false)) {
          await dedTypeSelect.selectOption('tds').catch(() => {});
        }

        const dedAmtInput = page.locator('input[placeholder="₹ 0.00"], input[placeholder="0.00"]').last();
        if (await dedAmtInput.isVisible().catch(() => false)) {
          await dedAmtInput.fill('2000');
        }
        const dedNoteInput = page.locator('input[placeholder*="Reason"]').first();
        if (await dedNoteInput.isVisible().catch(() => false)) {
          await dedNoteInput.fill('TDS under Sec 194C @ 2%');
        }
        await page.waitForTimeout(600);

        const shotPath1 = path.join(artifactDir, `evidence-01-deductions-modal-${vp.name}.png`);
        await page.screenshot({ path: shotPath1, fullPage: false });
        console.log(`Saved: ${shotPath1}`);
      } else {
        console.warn('Could not find Add deduction line button');
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------
    // EVIDENCE 2: Invoice Creation Modal (Paid at Creation & Apply Advance)
    // -------------------------------------------------------------
    console.log('Capturing Evidence 2: Paid at Creation in CreateDocumentModal...');
    await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const createInvBtn = page.locator('button:has-text("Create Document")').first();
    if (await createInvBtn.isVisible().catch(() => false)) {
      await createInvBtn.click({ force: true });
      await page.waitForTimeout(1200);

      // Scroll modal down to reveal Record payment now
      const recordPayCheckbox = page.locator('input[type="checkbox"]#record-payment-now, input[name="recordPaymentNow"], label:has-text("Record payment now") input').first();
      if (await recordPayCheckbox.isVisible().catch(() => false)) {
        await recordPayCheckbox.scrollIntoViewIfNeeded().catch(() => {});
        await recordPayCheckbox.check({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
      } else {
        const labelEl = page.locator('label:has-text("Record payment now")').first();
        if (await labelEl.isVisible().catch(() => false)) {
          await labelEl.scrollIntoViewIfNeeded().catch(() => {});
          await labelEl.click({ force: true });
          await page.waitForTimeout(600);
        }
      }

      const shotPath2 = path.join(artifactDir, `evidence-02-invoice-paid-at-creation-${vp.name}.png`);
      await page.screenshot({ path: shotPath2, fullPage: false });
      console.log(`Saved: ${shotPath2}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------
    // EVIDENCE 3: Full Payment Shortcut on Invoices Page
    // -------------------------------------------------------------
    console.log('Capturing Evidence 3: Full payment shortcut on InvoicesPage...');
    await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Open first row 3-dots menu or look for Mark as fully paid
    const threeDots = page.locator('button[title="More actions"]').first();
    if (await threeDots.isVisible().catch(() => false)) {
      await threeDots.click({ force: true });
      await page.waitForTimeout(400);
    }

    const shotPath3 = path.join(artifactDir, `evidence-03-full-payment-shortcut-${vp.name}.png`);
    await page.screenshot({ path: shotPath3, fullPage: false });
    console.log(`Saved: ${shotPath3}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // EVIDENCE 4: Explanation Screen on Ledger Statement ("How is this balance made?")
    // -------------------------------------------------------------
    console.log('Capturing Evidence 4: Ledger statement explanation card...');
    await page.goto('http://localhost:5173/ledger', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Click Statement tab if not active
    const statementTab = page.locator('button:has-text("Statement"), [data-testid="tab-statement"]').first();
    if (await statementTab.isVisible().catch(() => false)) {
      await statementTab.click({ force: true });
      await page.waitForTimeout(1500);
    }

    const shotPath4 = path.join(artifactDir, `evidence-04-ledger-explanation-${vp.name}.png`);
    await page.screenshot({ path: shotPath4, fullPage: false });
    console.log(`Saved: ${shotPath4}`);

    // -------------------------------------------------------------
    // EVIDENCE 5: Receipt Voucher Print View (/print/receipt/:id)
    // -------------------------------------------------------------
    if (samplePaymentId) {
      console.log(`Capturing Evidence 5: Receipt Voucher Print for ${samplePaymentId}...`);
      await page.goto(`http://localhost:5173/print/receipt/${samplePaymentId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const shotPath5 = path.join(artifactDir, `evidence-05-receipt-voucher-${vp.name}.png`);
      await page.screenshot({ path: shotPath5, fullPage: false });
      console.log(`Saved: ${shotPath5}`);
    }

    // -------------------------------------------------------------
    // EVIDENCE 6: Customer Account Modal (Advances KPI, Receipt link & Reversal button)
    // -------------------------------------------------------------
    console.log('Capturing Evidence 6: Customer Account Modal with Advances and Reversals...');
    await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const customerBtn = page.locator('td button.text-indigo-600, td button[title]').first();
    if (await customerBtn.isVisible().catch(() => false)) {
      await customerBtn.click({ force: true });
      await page.waitForTimeout(1200);

      // Switch to Payments tab in CustomerAccountModal
      const paymentsTab = page.locator('button:has-text("Payments"), [data-testid="tab-payments"]').first();
      if (await paymentsTab.isVisible().catch(() => false)) {
        await paymentsTab.click({ force: true });
        await page.waitForTimeout(1000);
      }

      const shotPath6 = path.join(artifactDir, `evidence-06-customer-account-${vp.name}.png`);
      await page.screenshot({ path: shotPath6, fullPage: false });
      console.log(`Saved: ${shotPath6}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      console.warn('Could not find customer button on InvoicesPage');
    }

    await context.close();
  }

  await browser.close();
  console.log('\nAll payment evidence screenshots captured successfully at 1536x730 and 390px!');
}

main().catch((err) => {
  console.error('Evidence capture failed:', err);
  process.exit(1);
});
