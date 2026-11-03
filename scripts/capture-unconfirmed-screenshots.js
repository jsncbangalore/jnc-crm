const { chromium } = require('playwright');
const path = require('path');

async function capture() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop (1536x730)
  const pageDesktop = await browser.newPage({
    viewport: { width: 1536, height: 730 },
  });
  await pageDesktop.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await pageDesktop.evaluate(() => {
    if ((window).setConnectionStatus) {
      (window).setConnectionStatus({
        state: 'offline',
        message: 'Not confirmed. Check before trying again',
      });
    }
  });
  await pageDesktop.waitForTimeout(500);
  const desktopPath = path.resolve(process.cwd(), 'evidence/session/evidence-unconfirmed-banner-1536x730.png');
  await pageDesktop.screenshot({ path: desktopPath });
  console.log('Saved:', desktopPath);
  await pageDesktop.close();

  // 2. Mobile (390px)
  const pageMobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await pageMobile.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await pageMobile.evaluate(() => {
    if ((window).setConnectionStatus) {
      (window).setConnectionStatus({
        state: 'offline',
        message: 'Not confirmed. Check before trying again',
      });
    }
  });
  await pageMobile.waitForTimeout(500);
  const mobilePath = path.resolve(process.cwd(), 'evidence/session/evidence-unconfirmed-banner-390px.png');
  await pageMobile.screenshot({ path: mobilePath });
  console.log('Saved:', mobilePath);
  await pageMobile.close();

  await browser.close();
}

capture().catch((e) => {
  console.error('Screenshot capture failed:', e);
  process.exit(1);
});
