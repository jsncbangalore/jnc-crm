const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';

async function runLandingPageTests() {
  console.log('========================================================================');
  console.log('PLAYWRIGHT TEST: PUBLIC /landing PAGE & MOBILE RESPONSIVENESS');
  console.log('Frontend URL:', BASE_URL);
  console.log('========================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${name}${details ? ' -> ' + details : ''}`);
    } else {
      console.error(`[FAIL] ${name}${details ? ' -> ' + details : ''}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // 1. Desktop Rendering & Zero Console Errors (1440px)
    // ------------------------------------------------------------------------
    console.log('--- 1. Desktop 1440px: /landing Rendering & Zero Console Errors ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();

    const consoleErrors = [];
    const pageErrors = [];

    desktopPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    desktopPage.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await desktopPage.goto(`${BASE_URL}/landing`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(1000);

    // Verify Hero content
    const heroHeadline = await desktopPage.locator('h1').textContent();
    console.log('Hero Headline detected:', heroHeadline.trim());
    assert(
      heroHeadline.includes('Manage leads. Close deals. Scale your business faster.'),
      'Hero headline renders intact'
    );

    // Verify Pricing Plans rendered
    const hasStarter = (await desktopPage.locator('text="Starter"').count()) > 0;
    const hasProfessional = (await desktopPage.locator('text="Professional"').count()) > 0;
    const hasEnterprise = (await desktopPage.locator('text="Enterprise"').count()) > 0;
    assert(hasStarter && hasProfessional && hasEnterprise, 'Pricing plans (Starter, Professional, Enterprise) rendered');

    // Assert zero console/page errors
    assert(consoleErrors.length === 0, 'No console errors on desktop /landing', consoleErrors.join(', '));
    assert(pageErrors.length === 0, 'No uncaught page errors on desktop /landing', pageErrors.join(', '));

    const ssDesktop = path.join(ARTIFACT_DIR, 'evidence-landing-1440-desktop.png');
    await desktopPage.screenshot({ path: ssDesktop, fullPage: false });
    console.log('Saved screenshot:', ssDesktop);

    // ------------------------------------------------------------------------
    // 2. Mobile Phone Width Rendering & Menu Test (390px)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Mobile Phone Width (390px): Responsiveness & Menu ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    const mobileConsoleErrors = [];
    const mobilePageErrors = [];

    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') {
        mobileConsoleErrors.push(msg.text());
      }
    });

    mobilePage.on('pageerror', (err) => {
      mobilePageErrors.push(err.message);
    });

    await mobilePage.goto(`${BASE_URL}/landing`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);

    // Verify no horizontal overflow
    const hasHorizontalScroll = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalScroll, 'Mobile view has no horizontal overflow/scroll at 390px width');

    // Verify Hamburger menu button is visible
    const menuBtn = mobilePage.locator('button[aria-label="Open menu"]');
    assert(await menuBtn.isVisible(), 'Mobile hamburger menu toggle is visible');

    // Open mobile menu
    await menuBtn.click();
    await mobilePage.waitForTimeout(500);

    const mobileMenu = mobilePage.locator('aside:has(button[aria-label="Close menu"])');
    assert(await mobileMenu.isVisible(), 'Mobile menu drawer opened');

    const hasMobileFeatures = (await mobileMenu.locator('text="Features"').count()) > 0;
    const hasMobilePricing = (await mobileMenu.locator('text="Pricing"').count()) > 0;
    assert(hasMobileFeatures && hasMobilePricing, 'Mobile menu drawer contains navigation links');

    // Close mobile menu
    const closeBtn = mobilePage.locator('button[aria-label="Close menu"]');
    await closeBtn.click();
    await mobilePage.waitForTimeout(500);

    // Assert zero console errors on mobile
    assert(mobileConsoleErrors.length === 0, 'No console errors on mobile /landing', mobileConsoleErrors.join(', '));
    assert(mobilePageErrors.length === 0, 'No uncaught page errors on mobile /landing', mobilePageErrors.join(', '));

    const ssMobile = path.join(ARTIFACT_DIR, 'evidence-landing-390-mobile.png');
    await mobilePage.screenshot({ path: ssMobile, fullPage: false });
    console.log('Saved screenshot:', ssMobile);

    // ------------------------------------------------------------------------
    // 3. Login Page 'Back to Home' Link Navigation
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Login Page: "Back to Home" Link -> /landing ---');
    await desktopPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(800);

    const backToHomeLink = desktopPage.locator('a[href="/landing"]:has-text("Back to Home")');
    assert(await backToHomeLink.isVisible(), '"Back to Home" link is visible on login page');

    const ssLogin = path.join(ARTIFACT_DIR, 'evidence-login-back-to-home.png');
    await desktopPage.screenshot({ path: ssLogin, fullPage: false });
    console.log('Saved screenshot:', ssLogin);

    await backToHomeLink.click();
    await desktopPage.waitForURL((url) => url.pathname.includes('/landing'), { timeout: 10000 });
    console.log('Navigated via "Back to Home", current URL:', desktopPage.url());

    assert(desktopPage.url().includes('/landing'), '"Back to Home" successfully navigates to /landing');

    console.log('\n========================================================================');
    console.log(`ALL TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('========================================================================\n');

  } finally {
    await browser.close();
  }
}

runLandingPageTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
