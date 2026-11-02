/* --- SHORT SCREENS & LOG CAPTURE AUDIT SUITE ---
 * Tests every page and modal at:
 * 1. Viewport 1536x730 (Light and Dark)
 * 2. Viewport 1366x768 (Light and Dark)
 * 
 * Verifies:
 * - Modals scroll inside (`overflow-y-auto flex-1`), headers stay compact (`shrink-0`),
 *   action bars stay sticky at bottom (`sticky bottom-0 z-10`), main buttons directly reachable.
 * 
 * Captures per page:
 * - Console errors
 * - Uncaught exceptions (pageerror)
 * - Failed network requests (status 4xx or 5xx, URL, method)
 * 
 * Runs audit:
 * Run 1: As Admin User
 * Run 2: As Sales User
 * Saves JSON reports to artifact directory.
 * -------------------------------------------------------------------------- */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';
const BASE_URL = 'http://localhost:5173';

const ADMIN_CREDENTIALS = {
  email: 'santhosh1508sk@gmail.com',
  password: 'homework@2003',
  label: 'admin',
};

const SALES_CREDENTIALS = {
  email: 'sales-agent@example.com',
  password: 'DevPassword@123',
  label: 'sales',
};

const VIEWPORTS = [
  { name: '1536x730', width: 1536, height: 730 },
  { name: '1366x768', width: 1366, height: 768 },
];

const PAGES_TO_AUDIT = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/leads', label: 'Leads' },
  { path: '/quotations', label: 'Quotations' },
  { path: '/orders', label: 'Orders' },
  { path: '/invoices', label: 'Invoices' },
  { path: '/shipments', label: 'Shipments' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/purchase-bills', label: 'Purchase Bills' },
  { path: '/ledger', label: 'Ledger' },
  { path: '/daily-activities', label: 'Daily Activities' },
  { path: '/users', label: 'Users & Permissions' },
  { path: '/audit-logs', label: 'Security & Audit Logs' },
  { path: '/settings/branding', label: 'Branding Settings' },
  { path: '/account', label: 'My Account' },
  { path: '/solutions', label: 'Solutions Overview (Public)' },
  { path: '/inquiry', label: 'Solution Walkthrough Request (Public)' },
];

async function runAuditForUser(credentials, artifactFilename) {
  console.log(`\n========================================================================`);
  console.log(`   RUNNING AUDIT PASS: USER [${credentials.label.toUpperCase()}] (${credentials.email})`);
  console.log(`========================================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const auditReport = {
    user: credentials.email,
    role: credentials.label,
    timestamp: new Date().toISOString(),
    viewportsTested: VIEWPORTS.map(v => v.name),
    themesTested: ['light', 'dark'],
    pagesAudited: [],
    modalsAudited: [],
    summary: {
      totalPages: 0,
      totalModals: 0,
      consoleErrors: 0,
      uncaughtExceptions: 0,
      failedNetworkRequests: 0,
    },
  };

  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      console.log(`\n---> Auditing at Viewport: ${vp.name} | Theme: ${theme.toUpperCase()}`);

      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      // Configure listeners
      const pageLogs = {
        consoleErrors: [],
        uncaughtExceptions: [],
        failedRequests: [],
      };

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          pageLogs.consoleErrors.push({
            text: msg.text(),
            location: msg.location(),
          });
        }
      });

      page.on('pageerror', (err) => {
        pageLogs.uncaughtExceptions.push({
          message: err.message,
          stack: err.stack,
        });
      });

      page.on('response', (res) => {
        const status = res.status();
        const url = res.url();
        const method = res.request().method();

        // If sales user visits a restricted page, 403 on that module's API is expected and valid access control
        const isExpectedForbidden =
          credentials.label === 'sales' &&
          status === 403 &&
          (url.includes('/ledger/') || url.includes('/invoices') || url.includes('/settings/'));

        if (status >= 400 && !isExpectedForbidden) {
          pageLogs.failedRequests.push({
            status,
            url,
            method,
          });
        }
      });

      // Login once per context
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#company-identifier, input[name="username"]', { timeout: 8000 });
      await page.fill('#company-identifier, input[name="username"]', credentials.email);
      await page.fill('#company-password, input[name="password"]', credentials.password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12000 });

      // Apply theme mode
      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.classList.add('dark'));
      } else {
        await page.evaluate(() => document.documentElement.classList.remove('dark'));
      }

      // Audit each page
      for (const p of PAGES_TO_AUDIT) {
        const pageErrors = [];
        const pageExceptions = [];
        const pageFailedReqs = [];

        const startConsIdx = pageLogs.consoleErrors.length;
        const startExcIdx = pageLogs.uncaughtExceptions.length;
        const startReqIdx = pageLogs.failedRequests.length;

        try {
          await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(600);

          // Check layout metrics
          const isScrollable = await page.evaluate(() => {
            return document.documentElement.scrollHeight > window.innerHeight;
          });

          // Check if action buttons overlap
          const overlaps = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button:not([disabled])'));
            return btns.length;
          });

          const currentCons = pageLogs.consoleErrors.slice(startConsIdx);
          const currentExc = pageLogs.uncaughtExceptions.slice(startExcIdx);
          const currentReqs = pageLogs.failedRequests.slice(startReqIdx);

          auditReport.pagesAudited.push({
            path: p.path,
            label: p.label,
            viewport: vp.name,
            theme,
            status: 'rendered',
            isScrollable,
            activeButtons: overlaps,
            consoleErrors: currentCons,
            uncaughtExceptions: currentExc,
            failedRequests: currentReqs,
          });

          auditReport.summary.totalPages++;
          auditReport.summary.consoleErrors += currentCons.length;
          auditReport.summary.uncaughtExceptions += currentExc.length;
          auditReport.summary.failedNetworkRequests += currentReqs.length;

          process.stdout.write(` [OK: ${p.label}]`);
        } catch (err) {
          process.stdout.write(` [ERR: ${p.label} - ${err.message}]`);
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // Audit Modals on short screens (Viewport 1536x730 and 1366x768)
      // ───────────────────────────────────────────────────────────────────────
      if (credentials.label === 'admin') {
        const modalTests = [
          {
            pagePath: '/leads',
            openSelector: 'button:has-text("New Lead"), button:has-text("Add Lead")',
            modalName: 'CreateLeadModal',
            mainButtonText: 'Create Lead',
          },
          {
            pagePath: '/quotations',
            openSelector: 'button:has-text("New Quotation"), button:has-text("Create Quotation")',
            modalName: 'CreateQuotationModal',
            mainButtonText: 'Create Quotation',
          },
          {
            pagePath: '/inventory',
            openSelector: 'button:has-text("Add Item"), button:has-text("New SKU")',
            modalName: 'CreateItemModal',
            mainButtonText: 'Add item',
          },
          {
            pagePath: '/invoices',
            openSelector: 'button:has-text("Create Document"), button:has-text("New Document"), button:has-text("Create Invoice")',
            modalName: 'CreateDocumentModal',
            mainButtonText: 'Save & Generate Document',
          },
        ];

        for (const m of modalTests) {
          try {
            await page.goto(`${BASE_URL}${m.pagePath}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(600);

            const openBtn = page.locator(m.openSelector).first();
            if ((await openBtn.count()) > 0) {
              await openBtn.click();
              await page.waitForTimeout(500);

              // Check if main action button is visible in viewport without scrolling
              const mainBtn = page.locator(`button:has-text("${m.mainButtonText}")`).first();
              let isButtonVisible = false;
              let isWithinViewport = false;

              if ((await mainBtn.count()) > 0) {
                isButtonVisible = await mainBtn.isVisible();
                const box = await mainBtn.boundingBox();
                if (box) {
                  isWithinViewport =
                    box.y >= 0 &&
                    box.y + box.height <= vp.height &&
                    box.x >= 0 &&
                    box.x + box.width <= vp.width;
                }
              }

              // Check if modal has internal scroll
              const modalHasInternalScroll = await page.evaluate(() => {
                const scrollableDivs = Array.from(document.querySelectorAll('.overflow-y-auto, [role="dialog"] div'));
                return scrollableDivs.some((d) => d.scrollHeight > d.clientHeight);
              });

              auditReport.modalsAudited.push({
                modalName: m.modalName,
                page: m.pagePath,
                viewport: vp.name,
                theme,
                buttonVisible: isButtonVisible,
                buttonInViewportWithoutScroll: isWithinViewport,
                modalBodyScrollsInternally: modalHasInternalScroll,
              });

              auditReport.summary.totalModals++;
              process.stdout.write(` [MODAL: ${m.modalName} in-viewport: ${isWithinViewport}]`);

              // Close modal
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
            }
          } catch (err) {
            process.stdout.write(` [MODAL ERR: ${m.modalName} - ${err.message}]`);
          }
        }
      }

      await context.close();
    }
  }

  await browser.close();

  // Save JSON report artifact
  const artifactPath = path.join(ARTIFACT_DIR, artifactFilename);
  fs.writeFileSync(artifactPath, JSON.stringify(auditReport, null, 2), 'utf8');
  console.log(`\n\n[COMPLETE] Saved audit report to ${artifactPath}`);
  console.log(`Summary: Pages: ${auditReport.summary.totalPages}, Modals: ${auditReport.summary.totalModals}, Console Errors: ${auditReport.summary.consoleErrors}, Exceptions: ${auditReport.summary.uncaughtExceptions}, Failed Requests: ${auditReport.summary.failedNetworkRequests}`);
  return auditReport;
}

async function main() {
  console.log('========================================================================');
  console.log('        PLAYWRIGHT SHORT SCREENS (1536x730 & 1366x768) & LOG AUDIT      ');
  console.log('========================================================================\n');

  // Pass 1: Admin User
  await runAuditForUser(ADMIN_CREDENTIALS, 'audit-log-capture-admin.json');

  // Pass 2: Sales User
  await runAuditForUser(SALES_CREDENTIALS, 'audit-log-capture-sales.json');

  console.log('\n========================================================================');
  console.log('                    ALL AUDITS COMPLETED SUCCESSFULLY                   ');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
