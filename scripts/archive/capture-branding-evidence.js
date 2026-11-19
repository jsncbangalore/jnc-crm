/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

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

const PORT = 5199;

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
      'branding',
      'settings',
    ],
  };

  let currentBranding = {
    companyDisplayName: 'Our Company',
    companyPhone: '+91 80 2345 6789',
    companyLogoUrl: '/api/v1/settings/branding/logo',
    portalLogoUrl: null,
  };

  let currentProfile = {
    name: 'Our Company',
    phone: '+91 80 2345 6789',
    email: 'billing@ourcompany.example',
    address: 'Plot 42, Tech Corridor, Phase 1',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
    website: 'https://ourcompany.example',
    gstin: '29AAACH1234F1Z5',
    pan: 'AAACH1234F',
    invoicePrefix: 'INV',
    lutBondNo: 'AD290325000001X',
    lutValidity: '2027-03-31',
    bankName: 'HDFC Bank Ltd.',
    bankAccountNumber: '50200012345678',
    bankIfsc: 'HDFC0001234',
    bankBranch: 'Koramangala 4th Block',
    bankUpi: 'ourcompany@hdfcbank',
    signatoryName: 'Authorised Signatory',
    signatoryDesignation: 'Director',
    logoUrl: '/api/v1/settings/branding/logo',
    portalLogoUrl: null,
    requireTwoFactor: false,
  };

  async function setupPage(context, theme = 'light') {
    const page = await context.newPage();

    // Intercept API routes
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/auth/me')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
      }

      if (url.includes('/settings/branding/logo') && method === 'GET') {
        const logoPath = path.resolve(__dirname, '../apps/web/public/logo.png');
        if (fs.existsSync(logoPath)) {
          return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(logoPath) });
        }
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'OK' });
      }

      if (url.includes('/settings/branding/logo') && method === 'POST') {
        currentBranding.companyLogoUrl = '/api/v1/settings/branding/logo';
        currentProfile.logoUrl = '/api/v1/settings/branding/logo';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Document logo uploaded successfully. Used for invoices, quotations, and documents.',
            logoUrl: '/api/v1/settings/branding/logo',
            timestamp: Date.now(),
          }),
        });
      }

      if (url.includes('/settings/branding/portal-logo') && method === 'POST') {
        currentBranding.portalLogoUrl = '/api/v1/settings/branding/portal-logo';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Portal logo uploaded successfully.',
            portalLogoUrl: '/api/v1/settings/branding/portal-logo',
            timestamp: Date.now(),
          }),
        });
      }

      if (url.includes('/settings/branding') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentBranding),
        });
      }

      if (url.includes('/settings/branding') && method === 'POST') {
        const postData = route.request().postDataJSON() || {};
        if (postData.companyDisplayName) currentBranding.companyDisplayName = postData.companyDisplayName;
        if (postData.companyPhone) currentBranding.companyPhone = postData.companyPhone;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentBranding),
        });
      }

      if (url.includes('/settings/company-profile') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentProfile),
        });
      }

      if (url.includes('/settings/company-profile') && method === 'POST') {
        const postData = route.request().postDataJSON() || {};
        currentProfile = { ...currentProfile, ...postData };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentProfile),
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    // Set local storage
    await page.addInitScript(({ user, themeMode }) => {
      localStorage.setItem('auth_token', 'mock_token_admin');
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('theme', themeMode);
      localStorage.setItem('crm_cookie_consent', JSON.stringify({ necessary: true, preferences: true, analytics: true, timestamp: Date.now() }));
      if (themeMode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }, { user: mockUser, themeMode: theme });

    return page;
  }

  // Create sample 300x80 PNG file for testing
  const samplePngPath = path.resolve(__dirname, 'temp_sample_logo.png');
  const sampleHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Use public logo.png if exists
  const existingPublicLogo = path.resolve(__dirname, '../apps/web/public/logo.png');
  if (fs.existsSync(existingPublicLogo)) {
    fs.copyFileSync(existingPublicLogo, samplePngPath);
  } else {
    fs.writeFileSync(samplePngPath, Buffer.concat([sampleHeader, Buffer.alloc(1024, 0x20)]));
  }

  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  const themes = ['light', 'dark'];

  for (const vp of viewports) {
    for (const theme of themes) {
      console.log(`Capturing Branding Evidence [${vp.name} - ${theme}]...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      const page = await setupPage(context, theme);
      await page.goto(`http://localhost:${PORT}/settings/branding`);
      await page.waitForLoadState('networkidle');

      // Upload logo via file input
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(samplePngPath);
      await page.waitForTimeout(1000);

      // Edit company name to verify saving name works
      const nameInput = page.locator('input[placeholder="Enter company display name"]').first();
      await nameInput.fill('Our Company');

      // Click Save All Settings
      const saveBtn = page.locator('button:has-text("Save All Settings")').first();
      await saveBtn.click({ force: true });
      await page.waitForTimeout(1000);

      // 1. Capture Full Branding Settings Page
      const brandingFile = `branding-page-${vp.name}-${theme}.png`;
      const brandingPath = path.join(screenshotDir, brandingFile);
      await page.screenshot({ path: brandingPath, fullPage: true });

      const artifactBrandingPath = path.join(artifactDir, brandingFile);
      fs.copyFileSync(brandingPath, artifactBrandingPath);
      console.log(`  Saved: ${brandingFile}`);

      // 2. Capture Invoice Header Preview close-up
      const invoiceHeaderLocator = page.locator('div:has-text("Invoice Header Preview")').locator('..').first();
      if (await invoiceHeaderLocator.isVisible()) {
        const previewFile = `invoice-header-preview-${vp.name}-${theme}.png`;
        const previewPath = path.join(screenshotDir, previewFile);
        await invoiceHeaderLocator.screenshot({ path: previewPath });

        const artifactPreviewPath = path.join(artifactDir, previewFile);
        fs.copyFileSync(previewPath, artifactPreviewPath);
        console.log(`  Saved: ${previewFile}`);
      }

      await context.close();
    }
  }

  // Cleanup temp logo
  if (fs.existsSync(samplePngPath)) {
    try { fs.unlinkSync(samplePngPath); } catch {}
  }

  await browser.close();
  server.close();
  console.log('All branding evidence captured successfully!');
  process.exit(0);
});
