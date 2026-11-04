const { chromium, firefox } = require('playwright');

async function inspectStorage(page) {
  return await page.evaluate(() => {
    const lsKeys = Object.keys(localStorage);
    const ssKeys = Object.keys(sessionStorage);
    return {
      localStorageKeys: lsKeys,
      sessionStorageKeys: ssKeys,
    };
  });
}

async function runTwoBrowserTest(keepSignedIn) {
  console.log(`\n========================================================================`);
  console.log(`TEST: TWO REAL BROWSERS (Chromium & Firefox) - "Keep me signed in" = ${keepSignedIn}`);
  console.log(`========================================================================`);

  const browserChromium = await chromium.launch({ headless: true });
  const browserFirefox = await firefox.launch({ headless: true });

  const ctxChromium = await browserChromium.newContext();
  const pageChromium = await ctxChromium.newPage();

  const ctxFirefox = await browserFirefox.newContext();
  const pageFirefox = await ctxFirefox.newPage();

  console.log('[Step 1] Chromium: Navigating to http://localhost:5173/login ...');
  await pageChromium.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await pageChromium.waitForSelector('input#company-identifier');

  console.log('[Step 2] Chromium: Filling credentials and logging in...');
  await pageChromium.fill('input#company-identifier', 'admin@example.com');
  await pageChromium.fill('input#company-password', 'DemoPassword123!');

  const keepMeCheckbox = pageChromium.locator('input[type="checkbox"]').filter({ hasText: '' }).first();
  const isChecked = await pageChromium.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    return cb ? cb.checked : false;
  });

  if (keepSignedIn && !isChecked) {
    await pageChromium.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    });
  } else if (!keepSignedIn && isChecked) {
    await pageChromium.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) cb.click();
    });
  }

  await pageChromium.click('button:has-text("Sign in")');
  await pageChromium.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });
  console.log('  -> Chromium logged in successfully! Current URL:', pageChromium.url());

  // Wait for state to settle
  await pageChromium.waitForTimeout(1500);

  // Inspect Chromium storage & cookies
  const storageChromium = await inspectStorage(pageChromium);
  const cookiesChromium = await ctxChromium.cookies();
  const cookieNamesChromium = cookiesChromium.map((c) => ({
    name: c.name,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    expires: c.expires > 0 ? new Date(c.expires * 1000).toISOString() : 'Session',
  }));

  console.log('\n[Chromium Storage Keys After Login]');
  console.log('  localStorage keys:', storageChromium.localStorageKeys);
  console.log('  sessionStorage keys:', storageChromium.sessionStorageKeys);
  console.log('  cookies:', cookieNamesChromium.map(c => `${c.name} (httpOnly=${c.httpOnly}, secure=${c.secure}, sameSite=${c.sameSite}, expires=${c.expires})`));

  // Check if any access token is stored in localStorage or sessionStorage
  const tokenAudit = await pageChromium.evaluate(() => {
    const findings = [];
    for (const key of Object.keys(localStorage)) {
      const val = localStorage.getItem(key) || '';
      if (key.toLowerCase().includes('token') || (val.startsWith('ey') && val.includes('.'))) {
        findings.push({ storage: 'localStorage', key });
      }
      try {
        const parsed = JSON.parse(val);
        if (parsed && typeof parsed === 'object') {
          for (const subKey of Object.keys(parsed)) {
            if (subKey.toLowerCase().includes('token')) {
              findings.push({ storage: 'localStorage', key: `${key}.${subKey}` });
            }
          }
        }
      } catch {}
    }
    for (const key of Object.keys(sessionStorage)) {
      const val = sessionStorage.getItem(key) || '';
      if (key.toLowerCase().includes('token') || (val.startsWith('ey') && val.includes('.'))) {
        findings.push({ storage: 'sessionStorage', key });
      }
    }
    return findings;
  });
  console.log('  Access Token Storage Audit:', tokenAudit);

  // Step 3: Now open /dashboard in Firefox
  console.log('\n[Step 3] Firefox: Opening http://localhost:5173/dashboard in a completely separate browser (Firefox)...');
  await pageFirefox.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
  await pageFirefox.waitForTimeout(2000);

  const firefoxUrl = pageFirefox.url();
  console.log('  -> Firefox URL after accessing /dashboard:', firefoxUrl);
  const firefoxRedirected = firefoxUrl.includes('/login') || firefoxUrl.includes('/landing');
  console.log(`  -> Firefox redirected to /login or /landing: ${firefoxRedirected}`);

  const storageFirefox = await inspectStorage(pageFirefox);
  const cookiesFirefox = await ctxFirefox.cookies();
  console.log('  Firefox localStorage keys:', storageFirefox.localStorageKeys);
  console.log('  Firefox sessionStorage keys:', storageFirefox.sessionStorageKeys);
  console.log('  Firefox cookie names:', cookiesFirefox.map(c => c.name));

  await browserChromium.close();
  await browserFirefox.close();

  return {
    keepSignedIn,
    chromiumUrl: pageChromium.url(),
    firefoxUrl,
    firefoxRedirected,
    chromiumLocalStorageKeys: storageChromium.localStorageKeys,
    chromiumSessionStorageKeys: storageChromium.sessionStorageKeys,
    chromiumCookieNames: cookieNamesChromium,
    tokenAudit,
  };
}

async function main() {
  try {
    const resUnticked = await runTwoBrowserTest(false);
    const resTicked = await runTwoBrowserTest(true);
    console.log('\n========================================================================');
    console.log('TWO REAL BROWSERS TEST COMPLETE');
    console.log('========================================================================');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

main();
