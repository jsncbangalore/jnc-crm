const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('  [CONSOLE]', msg.text()));

  await page.goto('http://localhost:5173/login');
  await page.fill('#company-identifier', 'company-admin-test@example.internal');
  await page.fill('#company-password', 'Password@123456');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Set up 2-step verification');
  console.log('Arrived at setup. Checking storage...');
  
  const valBefore = await page.evaluate(() => sessionStorage.getItem('crm_pending_forced_setup'));
  console.log('val before reload:', valBefore);

  console.log('Reloading...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const valAfter = await page.evaluate(() => sessionStorage.getItem('crm_pending_forced_setup'));
  console.log('val after reload:', valAfter);

  const html = await page.innerHTML('body');
  console.log('Does HTML contain error message?:', html.includes('Your setup session ended. Please sign in again.'));
  console.log('Error elements:', await page.locator('[role="alert"]').allTextContents());

  await browser.close();
})();
