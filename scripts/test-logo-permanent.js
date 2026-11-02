const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- TEST 1: Visiting Landing Page ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  let logoImg = await page.locator('header img').first();
  let src = await logoImg.getAttribute('src');
  let alt = await logoImg.getAttribute('alt');
  console.log('Clean landing page logo src:', src, 'alt:', alt);

  console.log('--- TEST 2: Injecting Tenant Custom Logo into Storage ---');
  await page.evaluate(() => {
    localStorage.setItem('crm_branding_fake-tenant', JSON.stringify({
      companyDisplayName: 'Tenant Override Corp',
      companyLogoUrl: 'https://example.com/custom-tenant-logo.png'
    }));
    localStorage.setItem('app_branding', JSON.stringify({
      companyDisplayName: 'Tenant Override Corp',
      companyLogoUrl: 'https://example.com/custom-tenant-logo.png'
    }));
  });

  await page.reload({ waitUntil: 'networkidle' });
  logoImg = await page.locator('header img').first();
  src = await logoImg.getAttribute('src');
  alt = await logoImg.getAttribute('alt');
  console.log('After tenant branding injection:');
  console.log('Logo src:', src);
  console.log('Logo alt:', alt);

  const header = await page.locator('header').first();
  const screenshotPath = path.join(__dirname, '..', 'permanent-logo-header.png');
  await header.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  await browser.close();
})();
