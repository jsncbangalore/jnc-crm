const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function getHeader(url, headerName) {
  const res = await fetch(url);
  await res.text();
  return res.headers.get(headerName);
}

async function run() {
  console.log('--- TEST POINT 5: NOINDEX ENFORCEMENT & SITEMAP / ROBOTS ---');

  // 1. Verify robots.txt
  console.log('\n[1] Verifying robots.txt...');
  const robotsPath = path.resolve(process.cwd(), 'apps/web/public/robots.txt');
  if (!fs.existsSync(robotsPath)) {
    throw new Error('robots.txt does not exist at ' + robotsPath);
  }
  const robotsContent = fs.readFileSync(robotsPath, 'utf8');
  console.log('robots.txt content:\n' + robotsContent.trim());
  if (!robotsContent.includes('Allow: /$') || !robotsContent.includes('Allow: /landing')) {
    throw new Error('robots.txt does not allow / and /landing');
  }
  if (!robotsContent.includes('Disallow: /')) {
    throw new Error('robots.txt does not disallow other routes');
  }
  if (!robotsContent.includes('sitemap.xml')) {
    throw new Error('robots.txt does not reference sitemap.xml');
  }
  console.log(' robots.txt verified successfully.');

  // 2. Verify sitemap.xml
  console.log('\n[2] Verifying sitemap.xml...');
  const sitemapPath = path.resolve(process.cwd(), 'apps/web/public/sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    throw new Error('sitemap.xml does not exist at ' + sitemapPath);
  }
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  console.log('sitemap.xml content:\n' + sitemapContent.trim());
  if (!sitemapContent.includes('<loc>/</loc>')) {
    throw new Error('sitemap.xml does not contain index route <loc>/</loc>');
  }
  // Must NOT include any other routes
  const disallowedUrls = ['/login', '/dashboard', '/leads', '/orders', '/inquiry', '/pricing', '/features'];
  for (const route of disallowedUrls) {
    if (sitemapContent.includes(route)) {
      throw new Error(`sitemap.xml illegally contains non-index route: ${route}`);
    }
  }
  console.log(' sitemap.xml verified successfully.');

  // 3. Verify HTTP X-Robots-Tag headers from web server & API server
  console.log('\n[3] Verifying HTTP X-Robots-Tag response headers...');
  const webBase = 'http://localhost:5173';
  const apiBase = 'http://localhost:3333';

  // '/' should NOT have noindex header
  const rootTag = await getHeader(`${webBase}/`, 'x-robots-tag');
  console.log(`GET / -> X-Robots-Tag: ${rootTag || '(none)'}`);
  if (rootTag && rootTag.includes('noindex')) {
    throw new Error('Root / illegally sent X-Robots-Tag: noindex!');
  }

  // '/landing' should NOT have noindex header
  const landingTag = await getHeader(`${webBase}/landing`, 'x-robots-tag');
  console.log(`GET /landing -> X-Robots-Tag: ${landingTag || '(none)'}`);
  if (landingTag && landingTag.includes('noindex')) {
    throw new Error('/landing illegally sent X-Robots-Tag: noindex!');
  }

  // Non-index web routes MUST have X-Robots-Tag: noindex, nofollow
  const protectedRoutes = ['/login', '/dashboard', '/inquiry', '/pricing', '/shared-cart'];
  for (const route of protectedRoutes) {
    const tag = await getHeader(`${webBase}${route}`, 'x-robots-tag');
    console.log(`GET ${route} -> X-Robots-Tag: ${tag || '(none)'}`);
    if (!tag || !tag.includes('noindex')) {
      throw new Error(`Route ${route} failed to send X-Robots-Tag: noindex, nofollow!`);
    }
  }

  // API endpoints MUST have X-Robots-Tag: noindex, nofollow
  const apiTag = await getHeader(`${apiBase}/api/v1/auth/csrf`, 'x-robots-tag');
  console.log(`API GET /api/v1/auth/csrf -> X-Robots-Tag: ${apiTag || '(none)'}`);
  if (!apiTag || !apiTag.includes('noindex')) {
    throw new Error('API failed to send X-Robots-Tag: noindex, nofollow!');
  }
  console.log(' HTTP X-Robots-Tag headers verified successfully.');

  // 4. Verify client-side <meta name="robots"> in Playwright
  console.log('\n[4] Verifying <meta name="robots"> in browser DOM across routes...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function checkMetaRobots(urlPath, expectedContent) {
    await page.goto(`${webBase}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const content = await page.evaluate(() => {
      const el = document.querySelector('meta[name="robots"]');
      return el ? el.getAttribute('content') : null;
    });
    console.log(`Route ${urlPath} -> <meta name="robots" content="${content}">`);
    if (content !== expectedContent) {
      throw new Error(`Route ${urlPath} expected <meta name="robots" content="${expectedContent}">, got "${content}"`);
    }
  }

  // Index and landing must be index, follow
  await checkMetaRobots('/', 'index, follow');
  await checkMetaRobots('/landing', 'index, follow');

  // Other routes must be noindex, nofollow
  await checkMetaRobots('/login', 'noindex, nofollow');
  await checkMetaRobots('/pricing', 'noindex, nofollow');
  await checkMetaRobots('/inquiry', 'noindex, nofollow');
  await checkMetaRobots('/shared-cart', 'noindex, nofollow');
  await checkMetaRobots('/help', 'noindex, nofollow');
  await checkMetaRobots('/terms', 'noindex, nofollow');
  await checkMetaRobots('/privacy', 'noindex, nofollow');

  await browser.close();
  console.log(' DOM <meta name="robots"> verified successfully.');

  console.log('\n=============================================');
  console.log(' ALL POINT 5 NOINDEX TESTS PASSED PERFECTLY! ');
  console.log('=============================================\n');
}

run().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
