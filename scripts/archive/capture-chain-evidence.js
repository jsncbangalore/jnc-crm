const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../apps/web/dist');
const screenshotDir = path.resolve(__dirname, '../deploy-release/screenshots');
const artifactDir = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// 1. Lightweight SPA server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath);
  const mimeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  res.writeHead(200, {
    'Content-Type': mimeMap[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 5198;

server.listen(PORT, async () => {
  console.log(`SPA Server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });

  const mockUser = {
    id: 'user_admin_1',
    name: 'Admin User',
    email: 'admin@ourcompany.example',
    role: 'admin',
    tenantId: 'tenant_1',
    effectivePages: [
      'dashboard',
      'leads',
      'quotations',
      'orders',
      'invoices',
      'ledger',
      'inventory',
      'suppliers',
      'shipments',
    ],
  };

  const mockCustomer = {
    id: 'cust_A',
    name: 'Customer A',
    gstin: '29ABCDE1234F1Z5',
    phone: '9876543210',
    email: 'contact@customer-a.example',
    address: '100 Business Park, Bengaluru',
    state: 'Karnataka',
  };

  const mockRelatedChain = {
    lead: { id: 'lead_1', leadNumber: 'LEAD-101', name: 'Customer A', company: 'Customer A' },
    quotation: {
      id: 'quote_1',
      quotationNumber: 'QTN/25-26/0001',
      status: 'converted',
      totalAmount: 18359.00,
      date: '2025-11-03',
    },
    order: {
      id: 'order_1',
      orderNumber: 'ORD/25-26/0001',
      status: 'confirmed',
      totalAmount: 18359.00,
      paidAmount: 17179.00,
      balanceAmount: 1180.00,
      date: '2025-11-04',
    },
    invoices: [
      {
        id: 'inv_1',
        invoiceNumber: 'INV/25-26/0001',
        docType: 'tax_invoice',
        status: 'issued',
        paymentStatus: 'paid',
        totalAmount: 16650.00,
        balanceDue: 0.00,
        issueDate: '2025-11-03',
      },
      {
        id: 'inv_2',
        invoiceNumber: 'INV/25-26/0002',
        docType: 'tax_invoice',
        status: 'issued',
        paymentStatus: 'partial',
        totalAmount: 1709.00,
        balanceDue: 1180.00,
        issueDate: '2025-12-02',
      },
    ],
    creditNotes: [],
    payments: [
      {
        id: 'pmt_1',
        receiptNumber: 'REC/25-26/0001',
        paymentDate: '2026-02-17',
        amount: 17179.00,
        paymentMethod: 'Bank Transfer',
        isAdvance: false,
      },
    ],
    ledgerEntries: [
      {
        id: 'ledg_1',
        entryDate: '2025-11-03',
        voucherType: 'sales',
        voucherNo: 'INV/25-26/0001',
        debit: 16650.00,
        credit: 0.00,
        particulars: 'Sales Tax Invoice #INV/25-26/0001',
      },
      {
        id: 'ledg_2',
        entryDate: '2026-02-17',
        voucherType: 'receipt',
        voucherNo: 'REC/25-26/0001',
        debit: 0.00,
        credit: 17179.00,
        particulars: 'Receipt #REC/25-26/0001 against invoices',
      },
    ],
  };

  const mockCustomerAccountSummary = {
    customer: mockCustomer,
    summary: {
      quotedValue: 18359.00,
      orderedValue: 18359.00,
      invoicedTotal: 18359.00,
      paidTotal: 17179.00,
      outstandingReceivable: 1180.00,
    },
    quotations: [
      {
        id: 'quote_1',
        quotationNumber: 'QTN/25-26/0001',
        status: 'converted',
        totalAmount: 18359.00,
        createdAt: '2025-11-03T10:00:00Z',
      },
    ],
    orders: [
      {
        id: 'order_1',
        orderNumber: 'ORD/25-26/0001',
        status: 'confirmed',
        totalAmount: 18359.00,
        paidAmount: 17179.00,
        createdAt: '2025-11-04T10:00:00Z',
      },
    ],
    invoices: [
      {
        id: 'inv_1',
        invoiceNumber: 'INV/25-26/0001',
        docType: 'tax_invoice',
        status: 'issued',
        paymentStatus: 'paid',
        totalAmount: 16650.00,
        balanceDue: 0.00,
        issueDate: '2025-11-03T10:00:00Z',
      },
      {
        id: 'inv_2',
        invoiceNumber: 'INV/25-26/0002',
        docType: 'tax_invoice',
        status: 'issued',
        paymentStatus: 'partial',
        totalAmount: 1709.00,
        balanceDue: 1180.00,
        issueDate: '2025-12-02T10:00:00Z',
      },
    ],
    payments: [
      {
        id: 'pmt_1',
        receiptNumber: 'REC/25-26/0001',
        amount: 17179.00,
        paymentDate: '2026-02-17T10:00:00Z',
        paymentMethod: 'Bank Transfer (NEFT)',
      },
    ],
    ledgerEntries: mockRelatedChain.ledgerEntries,
  };

  const setupPageMocks = async (page) => {
    await page.addInitScript((user) => {
      window.localStorage.setItem('token', 'mock_jwt_token_for_playwright');
      window.localStorage.setItem('user', JSON.stringify(user));
    }, mockUser);

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/auth/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: mockUser }),
        });
      }

      if (url.includes('/documents/') && url.includes('/related')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRelatedChain),
        });
      }

      if (url.includes('/customers/') && url.includes('/account-summary')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCustomerAccountSummary),
        });
      }

      if (url.includes('/quotations')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'quote_1',
              quoteNumber: 'QTN/25-26/0001',
              quotationNumber: 'QTN/25-26/0001',
              status: 'converted',
              totalAmount: 18359.00,
              subtotal: 15558.47,
              taxAmount: 2800.53,
              createdAt: '2025-11-03T10:00:00Z',
              customerId: 'cust_A',
              customerName: 'Customer A',
              companyName: 'Customer A',
              lines: [{ name: 'Industrial Hardware System', quantity: 1, unitPrice: 15558.47 }],
            },
          ]),
        });
      }

      if (url.includes('/orders')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'order_1',
                orderNumber: 'ORD/25-26/0001',
                status: 'confirmed',
                totalAmount: 18359.00,
                paidAmount: 17179.00,
                balanceAmount: 1180.00,
                paymentStatus: 'partial',
                confirmedAt: '2025-11-04T10:00:00Z',
                customerId: 'cust_A',
                customerName: 'Customer A',
                customerPhone: '9876543210',
                lines: [{ name: 'Industrial Hardware System', quantity: 1, unitPrice: 15558.47 }],
                invoices: [
                  {
                    id: 'inv_1',
                    invoiceNumber: 'INV/25-26/0001',
                    totalAmount: 16650.00,
                  },
                ],
              },
            ],
          }),
        });
      }

      if (url.includes('/invoices')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'inv_2',
              invoiceNumber: 'INV/25-26/0002',
              docType: 'tax_invoice',
              status: 'issued',
              paymentStatus: 'partial',
              subtotal: 1448.31,
              totalAmount: 1709.00,
              balanceDue: 1180.00,
              invoiceDate: '2025-12-02T10:00:00Z',
              customerId: 'cust_A',
              customerName: 'Customer A',
              customerState: 'Karnataka',
              customerPhone: '9876543210',
              lines: [{ description: 'Maintenance Service', quantity: 1, unitPrice: 1448.31, taxRate: 18 }],
            },
          ]),
        });
      }

      if (url.includes('/companies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([mockCustomer]),
        });
      }

      // Default empty fulfill
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
  };

  const captureSet = async (theme, viewport, suffix) => {
    const context = await browser.newContext({
      viewport,
      colorScheme: theme,
    });
    const page = await context.newPage();
    await setupPageMocks(page);

    // 1. Quotations Page with Related Documents Panel expanded
    console.log(`Capturing Quotations page (${theme}, ${suffix})...`);
    await page.goto(`http://localhost:${PORT}/quotations`, { waitUntil: 'networkidle' });
    if (theme === 'dark') {
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    } else {
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    }
    await page.waitForTimeout(1000);

    // Click quotation number to expand Related Documents Panel
    const quoteBtn = page.locator('button:has-text("QTN/25-26/0001")').first();
    if (await quoteBtn.isVisible()) {
      await quoteBtn.click();
      await page.waitForTimeout(600);
    }

    const quoteFile = path.join(screenshotDir, `quotation-chain-${suffix}.png`);
    await page.screenshot({ path: quoteFile, fullPage: false });
    fs.copyFileSync(quoteFile, path.join(artifactDir, `quotation-chain-${suffix}.png`));

    // 2. Orders Page with Related Documents Panel expanded
    console.log(`Capturing Orders page (${theme}, ${suffix})...`);
    await page.goto(`http://localhost:${PORT}/orders`, { waitUntil: 'networkidle' });
    if (theme === 'dark') {
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    }
    await page.waitForTimeout(1000);

    const orderBtn = page.locator('button:has-text("ORD/25-26/0001")').first();
    if (await orderBtn.isVisible()) {
      await orderBtn.click();
      await page.waitForTimeout(600);
    }

    const orderFile = path.join(screenshotDir, `order-chain-${suffix}.png`);
    await page.screenshot({ path: orderFile, fullPage: false });
    fs.copyFileSync(orderFile, path.join(artifactDir, `order-chain-${suffix}.png`));

    // 3. Customer Account View Modal
    console.log(`Capturing Customer Account View (${theme}, ${suffix})...`);
    const custBtn = page.locator('button:has-text("Customer A")').first();
    if (await custBtn.isVisible()) {
      await custBtn.click();
      await page.waitForTimeout(800);
    }

    const accountFile = path.join(screenshotDir, `customer-account-view-${suffix}.png`);
    await page.screenshot({ path: accountFile, fullPage: false });
    fs.copyFileSync(accountFile, path.join(artifactDir, `customer-account-view-${suffix}.png`));

    // Close customer modal
    const closeCustBtn = page.locator('button:has-text("Close")').last();
    if (await closeCustBtn.isVisible()) {
      await closeCustBtn.click();
      await page.waitForTimeout(400);
    }

    // 4. Unified Record Payment Modal (click 'Pay' on order)
    console.log(`Capturing Unified Record Payment Modal (${theme}, ${suffix})...`);
    const payBtn = page.locator('button:has-text("Pay")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await page.waitForTimeout(800);
    }

    const paymentFile = path.join(screenshotDir, `unified-payment-modal-${suffix}.png`);
    await page.screenshot({ path: paymentFile, fullPage: false });
    fs.copyFileSync(paymentFile, path.join(artifactDir, `unified-payment-modal-${suffix}.png`));

    await context.close();
  };

  try {
    // Desktop 1440px
    await captureSet('light', { width: 1440, height: 900 }, 'desktop-1440-light');
    await captureSet('dark', { width: 1440, height: 900 }, 'desktop-1440-dark');

    // Mobile 390px
    await captureSet('light', { width: 390, height: 844 }, 'mobile-390-light');
    await captureSet('dark', { width: 390, height: 844 }, 'mobile-390-dark');

    console.log('\n✓ ALL PLAYWRIGHT EVIDENCE SCREENSHOTS SUCCESSFULLY CAPTURED!');
  } catch (err) {
    console.error('Screenshot capture error:', err);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
