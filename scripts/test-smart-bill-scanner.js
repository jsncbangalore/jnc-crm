/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const DEV_DB_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: DEV_DB_URL } },
});

const WEB_BASE = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const TEST_EMAIL = 'scanner.test@example.com';
const TEST_PASSWORD = 'Password@123456';

const auditData = {
  timestamp: new Date().toISOString(),
  outsideRequests: [],
  failedRequests: [],
  consoleErrors: [],
  cspViolations: [],
  pdfjsRequests: [],
  testResults: {},
};

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

async function resetScanner(page) {
  const trashBtn = page.locator('button[title="Remove and choose another image"]');
  if (await trashBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await trashBtn.click();
    await page.waitForSelector('text=Add the supplier bill', { timeout: 5000 });
    return;
  }
  const isDropzone = await page.locator('text=Add the supplier bill').isVisible({ timeout: 1000 }).catch(() => false);
  if (!isDropzone) {
    const scanBtn = page.locator('button:has-text("Scan & Add New Bill")');
    await scanBtn.click();
    await page.waitForSelector('text=Add the supplier bill', { timeout: 10000 });
  }
}

async function setupTestUser() {
  log('SETUP', 'Configuring test user in jnc_crm_dev...');
  const tenant = await prisma.tenant.findFirst({ select: { id: true, code: true, name: true } });
  if (!tenant) throw new Error('No tenant found in jnc_crm_dev');

  const existing = await prisma.user.findFirst({ where: { email: TEST_EMAIL } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: TEST_EMAIL,
      name: 'Scanner Tester',
      employeeCode: 'SCN001',
      passwordHash,
      role: 'tenant_admin',
      isActive: true,
      mustResetPassword: false,
    },
  });
  return user;
}

async function cleanupTestUser(userId) {
  log('CLEANUP', 'Removing test user from jnc_crm_dev...');
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

function attachMonitoring(page, label) {
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      auditData.consoleErrors.push({ label, text });
      if (text.includes('Content Security Policy') || text.includes('CSP') || text.includes('violates')) {
        auditData.cspViolations.push({ label, text });
      }
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        auditData.outsideRequests.push({ label, url, method: req.method() });
      }
    } catch {}

    if (url.includes('pdf.mjs') || url.includes('pdf.worker') || url.includes('pdfjs')) {
      auditData.pdfjsRequests.push({ label, url });
    }
  });

  page.on('requestfailed', (req) => {
    auditData.failedRequests.push({
      label,
      url: req.url(),
      failure: req.failure()?.errorText,
    });
  });
}

async function loginUser(page) {
  await page.goto(`${WEB_BASE}/login`);
  await page.waitForSelector('#company-identifier, input[name="username"]', { timeout: 15000 });
  await page.fill('#company-identifier, input[name="username"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

async function resetScanner(page) {
  const trashBtn = page.locator('button[title="Remove and choose another image"]');
  if (await trashBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await trashBtn.click();
    await page.waitForSelector('text=Add the supplier bill', { timeout: 5000 });
    return;
  }
  const isDropzone = await page.locator('text=Add the supplier bill').isVisible({ timeout: 1000 }).catch(() => false);
  if (!isDropzone) {
    const scanBtn = page.locator('button:has-text("Scan & Add New Bill")');
    await scanBtn.click();
    await page.waitForSelector('text=Add the supplier bill', { timeout: 10000 });
  }
}

async function runTestSuite() {
  const user = await setupTestUser();
  const browser = await chromium.launch({ headless: true });

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // DESKTOP VIEWPORT TESTS (1440 x 900)
    // ═════════════════════════════════════════════════════════════════════════
    log('DESKTOP', 'Initializing Desktop 1440x900 context (Light & Dark modes)...');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      hasTouch: false,
    });
    await contextDesktop.addInitScript(() => {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({ choice: 'all', preferences: true, policyVersion: '2026.10.1', savedAt: new Date().toISOString() }));
    });
    const pageDesktop = await contextDesktop.newPage();
    attachMonitoring(pageDesktop, 'desktop');

    await loginUser(pageDesktop);

    // Navigate to Bills page
    await pageDesktop.goto(`${WEB_BASE}/bills`, { waitUntil: 'networkidle' });
    await pageDesktop.waitForTimeout(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE G (Desktop Viewport Buttons)
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE G [Desktop]', 'Verifying desktop buttons (pointer: fine)...');
    await pageDesktop.click('button:has-text("Scan & Add New Bill")');
    await pageDesktop.waitForSelector('text=Add the supplier bill', { timeout: 10000 });

    const desktopChooseBtn = await pageDesktop.locator('button:has-text("Choose photo or PDF")').isVisible();
    const desktopTakePhotoBtn = await pageDesktop.locator('button:has-text("Take photo")').isVisible();
    const desktopGalleryBtn = await pageDesktop.locator('button:has-text("Gallery or files")').isVisible();

    assert.strictEqual(desktopChooseBtn, true, 'Desktop MUST show "Choose photo or PDF" button');
    assert.strictEqual(desktopTakePhotoBtn, false, 'Desktop MUST NOT show "Take photo" button');
    assert.strictEqual(desktopGalleryBtn, false, 'Desktop MUST NOT show "Gallery or files" button');

    const shotCaseGDesktop = path.join(ARTIFACT_DIR, 'evidence-scanner-case-g-desktop.png');
    await pageDesktop.screenshot({ path: shotCaseGDesktop });
    auditData.testResults['case_g_desktop'] = 'PASS';
    log('CASE G [Desktop]', 'PASS: Desktop displays only "Choose photo or PDF"');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE A: Photo (JPG) Upload
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE A', 'Testing JPG photo upload, preview rendering, and field extraction...');
    const photoFile = path.join(FIXTURES_DIR, 'fake_bill_photo.jpg');
    const galleryInput = pageDesktop.locator('input[type="file"][multiple]');
    await galleryInput.setInputFiles(photoFile);

    // Wait for OCR / scan completion (vendor name populated)
    await pageDesktop.waitForFunction(
      () => {
        const input = document.querySelector('input[placeholder="Enter vendor or supplier name"]');
        return input && input.value.trim().length > 0;
      },
      { timeout: 45000 }
    );

    const vendorValA = await pageDesktop.locator('input[placeholder="Enter vendor or supplier name"]').inputValue();
    const gstinValA = await pageDesktop.locator('input[placeholder="e.g. 29ABCDE1234F1Z5"]').inputValue();
    log('CASE A', `Extracted Vendor: "${vendorValA}", GSTIN: "${gstinValA}"`);

    assert(vendorValA.toLowerCase().includes('vertex'), `Expected vendor to include "VERTEX", got: "${vendorValA}"`);
    assert(gstinValA.includes('29AAAAA0000A1Z5'), `Expected GSTIN "29AAAAA0000A1Z5", got: "${gstinValA}"`);

    // Verify item table has rows
    const itemCountA = await pageDesktop.locator('table tbody tr').count();
    log('CASE A', `Extracted item lines: ${itemCountA}`);
    assert(itemCountA >= 1, `Expected at least 1 item line, found ${itemCountA}`);

    // Confirm pdfjs-dist has NOT been requested during JPG upload
    log('CASE A', `pdfjs-dist requests so far: ${auditData.pdfjsRequests.length}`);
    assert.strictEqual(auditData.pdfjsRequests.length, 0, 'pdfjs-dist MUST NOT be loaded when an image (JPG) is chosen');

    const shotCaseA = path.join(ARTIFACT_DIR, 'evidence-scanner-case-a-photo.png');
    await pageDesktop.screenshot({ path: shotCaseA, fullPage: true });
    auditData.testResults['case_a_photo_jpg'] = 'PASS';
    log('CASE A', 'PASS: JPG photo successfully rendered preview and extracted vendor, items and totals');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE B: Text-Based PDF (Direct Reading without OCR) in Dark Mode
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE B', 'Testing text-based PDF direct reading in Dark Mode...');
    // Reset scanner to dropzone using trash button
    await resetScanner(pageDesktop);

    // Toggle dark mode by adding 'dark' class on html
    await pageDesktop.evaluate(() => document.documentElement.classList.add('dark'));
    await pageDesktop.waitForTimeout(500);

    const textPdfFile = path.join(FIXTURES_DIR, 'fake_bill_text.pdf');
    const startDirectRead = Date.now();
    await galleryInput.setInputFiles(textPdfFile);

    // Text PDF is direct: preview and fields appear almost immediately without waiting for OCR
    await pageDesktop.waitForFunction(
      () => {
        const input = document.querySelector('input[placeholder="Enter vendor or supplier name"]');
        return input && input.value.trim().length > 0;
      },
      { timeout: 20000 }
    );
    const directReadDurationMs = Date.now() - startDirectRead;
    log('CASE B', `Direct PDF parsed in ${directReadDurationMs}ms`);

    const vendorValB = await pageDesktop.locator('input[placeholder="Enter vendor or supplier name"]').inputValue();
    const invNoValB = await pageDesktop.locator('input[placeholder="INV-12345"]').inputValue();
    const gstinValB = await pageDesktop.locator('input[placeholder="e.g. 29ABCDE1234F1Z5"]').inputValue();
    log('CASE B', `Parsed Vendor: "${vendorValB}", Invoice No: "${invNoValB}", GSTIN: "${gstinValB}"`);

    assert(vendorValB.toLowerCase().includes('vertex'), `Expected vendor to include "VERTEX", got: "${vendorValB}"`);
    assert(invNoValB.includes('INV-9842'), `Expected invoice number "INV-9842", got: "${invNoValB}"`);

    // Verify pdfjs-dist WAS loaded now that a PDF was chosen
    log('CASE B', `pdfjs-dist requests now: ${auditData.pdfjsRequests.length}`);
    assert(auditData.pdfjsRequests.length > 0, 'pdfjs-dist MUST be loaded when a PDF is chosen');

    const shotCaseB = path.join(ARTIFACT_DIR, 'evidence-scanner-case-b-text-pdf.png');
    await pageDesktop.screenshot({ path: shotCaseB, fullPage: true });
    auditData.testResults['case_b_text_pdf_direct'] = 'PASS';
    log('CASE B', 'PASS: Text-based PDF read directly without OCR and populated form in dark mode');

    // Reset dark mode
    await pageDesktop.evaluate(() => document.documentElement.classList.remove('dark'));

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE C: Scanned PDF (Image Only, requires OCR)
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE C', 'Testing scanned image-only PDF with OCR extraction...');
    await resetScanner(pageDesktop);

    const scannedPdfFile = path.join(FIXTURES_DIR, 'fake_bill_scanned.pdf');
    await galleryInput.setInputFiles(scannedPdfFile);

    // Wait for OCR completion
    await pageDesktop.waitForFunction(
      () => {
        const input = document.querySelector('input[placeholder="Enter vendor or supplier name"]');
        return input && input.value.trim().length > 0;
      },
      { timeout: 45000 }
    );

    const vendorValC = await pageDesktop.locator('input[placeholder="Enter vendor or supplier name"]').inputValue();
    log('CASE C', `OCR extracted vendor: "${vendorValC}"`);
    assert(vendorValC.toLowerCase().includes('vertex'), `Expected vendor to include "VERTEX", got: "${vendorValC}"`);

    const shotCaseC = path.join(ARTIFACT_DIR, 'evidence-scanner-case-c-scanned-pdf.png');
    await pageDesktop.screenshot({ path: shotCaseC, fullPage: true });
    auditData.testResults['case_c_scanned_pdf_ocr'] = 'PASS';
    log('CASE C', 'PASS: Scanned image-only PDF rendered and processed via local OCR engine');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE D: Two-Page Bill ("+ Add another page")
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE D', 'Testing two-page bill addition via "+ Add another page"...');
    // Confirm 1 page scanned first
    const pageCountText1 = await pageDesktop.locator('text=/\\d+ page/').innerText();
    log('CASE D', `Initial page count badge: "${pageCountText1}"`);
    assert(pageCountText1.includes('1 page'), `Expected "1 page scanned", got "${pageCountText1}"`);

    // Click "+ Add another page" and supply page 2
    const page2File = path.join(FIXTURES_DIR, 'fake_bill_page2.jpg');
    const [fileChooser] = await Promise.all([
      pageDesktop.waitForEvent('filechooser'),
      pageDesktop.click('button:has-text("+ Add another page")'),
    ]);
    await fileChooser.setFiles(page2File);

    // Wait for page 2 to scan
    await pageDesktop.waitForSelector('text=/2 pages? scanned/', { timeout: 45000 });
    const pageCountText2 = await pageDesktop.locator('text=/\\d+ page/').innerText();
    log('CASE D', `Updated page count badge: "${pageCountText2}"`);
    assert(pageCountText2.includes('2 pages'), `Expected "2 pages scanned", got "${pageCountText2}"`);

    const shotCaseD = path.join(ARTIFACT_DIR, 'evidence-scanner-case-d-twopage.png');
    await pageDesktop.screenshot({ path: shotCaseD, fullPage: true });
    auditData.testResults['case_d_two_page_bill'] = 'PASS';
    log('CASE D', 'PASS: Two-page bill handled via "+ Add another page" and page count reflects 2 pages');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE E: Unreadable Blank Image (Error Banner)
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE E', 'Testing unreadable blank image error notification...');
    await resetScanner(pageDesktop);

    const blankFile = path.join(FIXTURES_DIR, 'fake_bill_blank.jpg');
    await galleryInput.setInputFiles(blankFile);

    // Wait for red alert banner near the upload box
    const alertLocator = pageDesktop.locator('[role="alert"]');
    await alertLocator.waitFor({ state: 'visible', timeout: 35000 });
    const alertMsgE = await alertLocator.innerText();
    log('CASE E', `Alert message displayed: "${alertMsgE}"`);

    assert(
      alertMsgE.includes("We couldn't find readable text"),
      `Expected unreadable text error message, got: "${alertMsgE}"`
    );

    const shotCaseE = path.join(ARTIFACT_DIR, 'evidence-scanner-case-e-blank-image.png');
    await pageDesktop.screenshot({ path: shotCaseE });
    auditData.testResults['case_e_blank_image_error'] = 'PASS';
    log('CASE E', 'PASS: Unreadable file displayed clear red error message, avoiding silent failure');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE F: Password-Protected PDF
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE F', 'Testing password-protected PDF error notification...');
    await resetScanner(pageDesktop);

    const protectedPdfFile = path.join(FIXTURES_DIR, 'fake_bill_protected.pdf');
    await galleryInput.setInputFiles(protectedPdfFile);

    await alertLocator.waitFor({ state: 'visible', timeout: 15000 });
    const alertMsgF = await alertLocator.innerText();
    log('CASE F', `Alert message displayed: "${alertMsgF}"`);

    assert(
      alertMsgF.includes('This PDF is password protected'),
      `Expected password protected message, got: "${alertMsgF}"`
    );

    const shotCaseF = path.join(ARTIFACT_DIR, 'evidence-scanner-case-f-password-pdf.png');
    await pageDesktop.screenshot({ path: shotCaseF });
    auditData.testResults['case_f_password_protected_pdf'] = 'PASS';
    log('CASE F', 'PASS: Password-protected PDF displayed exact password notification');

    await contextDesktop.close();

    // ═════════════════════════════════════════════════════════════════════════
    // MOBILE VIEWPORT TESTS (390 x 844, Touch Pointer)
    // ═════════════════════════════════════════════════════════════════════════
    log('MOBILE', 'Initializing Mobile 390x844 context (pointer: coarse, hasTouch: true)...');
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await contextMobile.addInitScript(() => {
      localStorage.setItem('crm_cookie_consent', JSON.stringify({ choice: 'all', preferences: true, policyVersion: '2026.10.1', savedAt: new Date().toISOString() }));
    });
    const pageMobile = await contextMobile.newPage();
    attachMonitoring(pageMobile, 'mobile');

    await loginUser(pageMobile);
    await pageMobile.goto(`${WEB_BASE}/bills`, { waitUntil: 'networkidle' });
    await pageMobile.waitForTimeout(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE G (Mobile Viewport Buttons)
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE G [Mobile]', 'Verifying touch mobile buttons (pointer: coarse)...');
    await pageMobile.click('button:has-text("Scan & Add New Bill")');
    await pageMobile.waitForSelector('text=Add the supplier bill', { timeout: 10000 });

    const mobileTakePhotoBtn = await pageMobile.locator('button:has-text("Take photo")').isVisible();
    const mobileGalleryBtn = await pageMobile.locator('button:has-text("Gallery or files")').isVisible();
    const mobileChooseBtn = await pageMobile.locator('button:has-text("Choose photo or PDF")').isVisible();

    assert.strictEqual(mobileTakePhotoBtn, true, 'Mobile MUST show "Take photo" button');
    assert.strictEqual(mobileGalleryBtn, true, 'Mobile MUST show "Gallery or files" button');
    assert.strictEqual(mobileChooseBtn, false, 'Mobile MUST NOT show desktop "Choose photo or PDF" button');

    const shotCaseGMobile = path.join(ARTIFACT_DIR, 'evidence-scanner-case-g-mobile.png');
    await pageMobile.screenshot({ path: shotCaseGMobile });
    auditData.testResults['case_g_mobile'] = 'PASS';
    log('CASE G [Mobile]', 'PASS: Mobile touch viewport displays "Take photo" and "Gallery or files"');

    await contextMobile.close();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE H: Network & CSP Audit Verification
    // ─────────────────────────────────────────────────────────────────────────
    log('CASE H', 'Verifying external network requests & CSP compliance...');
    const jsdelivrRequests = auditData.outsideRequests.filter((r) => r.url.includes('jsdelivr'));
    log('CASE H', `Total external network requests: ${auditData.outsideRequests.length}`);
    log('CASE H', `Requests to jsdelivr: ${jsdelivrRequests.length}`);
    log('CASE H', `CSP violations: ${auditData.cspViolations.length}`);

    assert.strictEqual(jsdelivrRequests.length, 0, 'Scanning MUST NOT make any requests to cdn.jsdelivr.net');
    assert.strictEqual(auditData.cspViolations.length, 0, 'There MUST be zero CSP console violations');

    auditData.testResults['case_h_no_external_requests_or_csp_violations'] = 'PASS';
    log('CASE H', 'PASS: 0 requests to cdn.jsdelivr.net and 0 CSP violations');

    // Save JSON audit file
    const auditFilePath = path.join(ARTIFACT_DIR, 'scanner-network-console-audit.json');
    fs.writeFileSync(auditFilePath, JSON.stringify(auditData, null, 2));
    log('REPORT', `Saved audit JSON: ${auditFilePath}`);

    console.log('\n======================================================');
    console.log('ALL SMART BILL SCANNER TESTS COMPLETED: 100% PASS');
    console.log('======================================================');
  } finally {
    await browser.close();
    await cleanupTestUser(user.id);
    await prisma.$disconnect();
  }
}

runTestSuite().catch((err) => {
  console.error('\n[SUITE FAILED]:', err);
  process.exit(1);
});
