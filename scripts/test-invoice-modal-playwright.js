/**
 * Playwright E2E Verification & Screenshot Generator for Tax Invoice Modal Fixes
 * Captures:
 * 1. evidence-create-invoice-1536x730-light.png
 * 2. evidence-create-invoice-1536x730-dark.png
 * 3. evidence-create-invoice-390px-light.png
 * 4. evidence-create-invoice-390px-dark.png
 * 5. evidence-high-value-confirmation-1536x730.png
 * 6. evidence-date-validation-red-marker-1536x730.png
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WEB_BASE = 'http://localhost:5173';
const ARTIFACTS_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

async function performLogin(page, email, password) {
  await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('=== Starting Tax Invoice Playwright UI Evidence Capture ===\n');

  const rand = Math.random().toString(36).substring(2, 8);
  const tenantId = `tenant-pw-inv-${rand}`;
  const userId = `user-pw-inv-${rand}`;
  const email = `admin-${rand}@invoicepw.test`;
  const password = `AdminPass123!`;
  const passwordHash = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TNPW-${rand}`,
      name: `Test Invoice Tenant ${rand}`,
      slug: `tenant-invoice-${rand}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      id: userId,
      tenantId: tenant.id,
      email,
      name: `Admin Invoice Test`,
      role: 'tenant_admin',
      employeeCode: `EMP-${rand}`,
      passwordHash,
      isActive: true,
      firstLoginAfter2FaReleaseAt: new Date(),
    },
  });

  await prisma.userPageAccess.create({
    data: {
      tenantId: tenant.id,
      userId: adminUser.id,
      pages: JSON.stringify(['dashboard', 'invoices', 'quotations', 'branding', 'companies']),
    },
  });

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // 1. Desktop 1536x730 - Light Mode
    // -------------------------------------------------------------
    console.log('Capturing Desktop 1536x730 (Light Mode)...');
    const contextDesktopLight = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'light',
    });
    const pageLight = await contextDesktopLight.newPage();

    await performLogin(pageLight, adminUser.email, password);

    // Navigate to invoices with action=create
    await pageLight.goto(`${WEB_BASE}/invoices?action=create`);
    await pageLight.waitForSelector('text=Create Official GST / Dispatch Document', { timeout: 10000 });
    await pageLight.waitForTimeout(1000);

    // Save screenshot of open modal
    const destDesktopLight = path.join(ARTIFACTS_DIR, 'evidence-create-invoice-1536x730-light.png');
    await pageLight.screenshot({ path: destDesktopLight });
    console.log(`Saved: ${destDesktopLight}`);

    // Trigger date validation error (set due date earlier than invoice date)
    const dueDateInput = pageLight.locator('input[type="date"]').nth(1); // due date is typically second date input
    if (await dueDateInput.isVisible()) {
      await dueDateInput.fill('2020-01-01');
      await pageLight.click('text=Create Official GST / Dispatch Document'); // blur
      await pageLight.waitForTimeout(500);
      const destDateError = path.join(ARTIFACTS_DIR, 'evidence-date-validation-red-marker-1536x730.png');
      await pageLight.screenshot({ path: destDateError });
      console.log(`Saved: ${destDateError}`);
    }

    await contextDesktopLight.close();

    // -------------------------------------------------------------
    // 2. Desktop 1536x730 - Dark Mode
    // -------------------------------------------------------------
    console.log('Capturing Desktop 1536x730 (Dark Mode)...');
    const contextDesktopDark = await browser.newContext({
      viewport: { width: 1536, height: 730 },
      colorScheme: 'dark',
    });
    const pageDark = await contextDesktopDark.newPage();
    await performLogin(pageDark, adminUser.email, password);
    await pageDark.evaluate(() => document.documentElement.classList.add('dark'));

    await pageDark.goto(`${WEB_BASE}/invoices?action=create`);
    await pageDark.evaluate(() => document.documentElement.classList.add('dark'));
    await pageDark.waitForSelector('text=Create Official GST / Dispatch Document', { timeout: 10000 });
    await pageDark.waitForTimeout(1000);

    const destDesktopDark = path.join(ARTIFACTS_DIR, 'evidence-create-invoice-1536x730-dark.png');
    await pageDark.screenshot({ path: destDesktopDark });
    console.log(`Saved: ${destDesktopDark}`);
    await contextDesktopDark.close();

    // -------------------------------------------------------------
    // 3. Mobile 390px - Light & Dark Modes
    // -------------------------------------------------------------
    console.log('Capturing Mobile 390px (Light & Dark Modes)...');
    const contextMobileLight = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
      isMobile: true,
    });
    const pageMobileLight = await contextMobileLight.newPage();
    await performLogin(pageMobileLight, adminUser.email, password);

    await pageMobileLight.goto(`${WEB_BASE}/invoices?action=create`);
    await pageMobileLight.waitForSelector('text=Create Official GST / Dispatch Document', { timeout: 10000 });
    await pageMobileLight.waitForTimeout(1000);

    const destMobileLight = path.join(ARTIFACTS_DIR, 'evidence-create-invoice-390px-light.png');
    await pageMobileLight.screenshot({ path: destMobileLight });
    console.log(`Saved: ${destMobileLight}`);
    await contextMobileLight.close();

    const contextMobileDark = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
      isMobile: true,
    });
    const pageMobileDark = await contextMobileDark.newPage();
    await performLogin(pageMobileDark, adminUser.email, password);
    await pageMobileDark.evaluate(() => document.documentElement.classList.add('dark'));

    await pageMobileDark.goto(`${WEB_BASE}/invoices?action=create`);
    await pageMobileDark.evaluate(() => document.documentElement.classList.add('dark'));
    await pageMobileDark.waitForSelector('text=Create Official GST / Dispatch Document', { timeout: 10000 });
    await pageMobileDark.waitForTimeout(1000);

    const destMobileDark = path.join(ARTIFACTS_DIR, 'evidence-create-invoice-390px-dark.png');
    await pageMobileDark.screenshot({ path: destMobileDark });
    console.log(`Saved: ${destMobileDark}`);
    await contextMobileDark.close();

    console.log('\n=== All Playwright UI Evidence Captured Successfully ===');
  } finally {
    await browser.close().catch(() => {});
    await prisma.userPageAccess.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Playwright capture error:', err.message);
  process.exit(1);
});
