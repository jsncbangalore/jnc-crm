const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const artifactDir = path.resolve(
  'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824'
);

async function performLogin(page) {
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

  const remindLaterBtn = page.locator('button:has-text("Remind me later"), button:has-text("Skip"), button:has-text("Continue to app")');
  if (await remindLaterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await remindLaterBtn.click();
  }

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function run() {
  console.log('========================================================================');
  console.log('  CAPTURE UNLINKED INVOICES SCREENSHOTS (1536x730 & 390px)');
  console.log('========================================================================\n');

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@seed.dev' },
  });
  if (!admin || !admin.tenantId) throw new Error('No admin@seed.dev user found');

  // Ensure grace period is active
  await prisma.user.update({
    where: { id: admin.id },
    data: { firstLoginAfter2FaReleaseAt: new Date() },
  });

  // Create temporary unlinked invoice for screenshot verification
  const testInv = await prisma.invoice.create({
    data: {
      tenantId: admin.tenantId,
      invoiceNumber: `INV-UNLINK-${Date.now().toString().slice(-6)}`,
      invoiceDate: new Date(),
      customerName: 'Delta Unlinked Enterprises',
      customerPhone: '9845099999',
      customerGstin: '29ABCDE1234F1Z5',
      totalAmount: 48500,
      balanceDue: 48500,
      subtotal: 41101.69,
      docType: 'tax_invoice',
      paymentStatus: 'unpaid',
      createdById: admin.id,
    },
  });
  console.log(`[TEST DATA] Created temporary unlinked invoice: ${testInv.invoiceNumber}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ----------------------------------------------------
    // 1. DESKTOP VIEWPORT: 1536 x 730
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Desktop Viewport (1536x730) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1536, height: 730 },
    });
    const desktopPage = await desktopContext.newPage();

    await performLogin(desktopPage);
    console.log('Logged in successfully on desktop. Navigating to /invoices...');

    await desktopPage.goto('http://localhost:5173/invoices', { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForTimeout(2000);

    const unlinkedBtn = desktopPage.locator('button:has-text("Unlinked")');
    if (await unlinkedBtn.isVisible().catch(() => false)) {
      await unlinkedBtn.first().click();
      console.log('Clicked "Unlinked" button on Invoices page.');
    } else {
      await desktopPage.goto('http://localhost:5173/ledger', { waitUntil: 'domcontentloaded' });
      await desktopPage.waitForTimeout(2000);
      const ledgerUnlinkedBtn = desktopPage.locator('button:has-text("Unlinked Invoices")');
      await ledgerUnlinkedBtn.click();
      console.log('Clicked "Unlinked Invoices" button on Ledger page.');
    }

    await desktopPage.waitForSelector('text=Unlinked Invoices Reconciliation', { timeout: 10000 });
    await desktopPage.waitForTimeout(1000);

    const desktopScreenshotPath = path.join(artifactDir, 'evidence-unlinked-invoices-1536x730.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath });
    console.log(`[SAVED] Desktop screenshot: ${desktopScreenshotPath}`);
    await desktopContext.close();

    // ----------------------------------------------------
    // 2. MOBILE VIEWPORT: 390 x 844
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Mobile Viewport (390px) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    await performLogin(mobilePage);
    console.log('Logged in successfully on mobile. Navigating to /invoices...');

    await mobilePage.goto('http://localhost:5173/invoices', { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2000);

    const mUnlinkedBtn = mobilePage.locator('button:has-text("Unlinked")');
    if (await mUnlinkedBtn.isVisible().catch(() => false)) {
      await mUnlinkedBtn.first().click();
      console.log('Clicked "Unlinked" button on mobile.');
    } else {
      await mobilePage.goto('http://localhost:5173/ledger', { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForTimeout(2000);
      const mLedgerUnlinkedBtn = mobilePage.locator('button:has-text("Unlinked Invoices")');
      await mLedgerUnlinkedBtn.click();
      console.log('Clicked "Unlinked Invoices" button on Ledger page on mobile.');
    }

    await mobilePage.waitForSelector('text=Unlinked Invoices Reconciliation', { timeout: 10000 });
    await mobilePage.waitForTimeout(1000);

    const mobileScreenshotPath = path.join(artifactDir, 'evidence-unlinked-invoices-390px.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    console.log(`[SAVED] Mobile screenshot: ${mobileScreenshotPath}`);
    await mobileContext.close();

    console.log('\n[PASS] Captured screenshots at 1536x730 and 390px successfully!');
  } finally {
    await browser.close();
    // Cleanup temporary invoice
    await prisma.invoice.deleteMany({
      where: { id: testInv.id },
    });
    console.log(`[CLEANUP] Deleted test invoice ${testInv.invoiceNumber}`);
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Error running screenshot capture:', err);
  process.exit(1);
});
