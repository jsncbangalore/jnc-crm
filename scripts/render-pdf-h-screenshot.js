const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function renderScreenshot() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  const pdfPath = path.resolve('scratch/test-pdf-h-exact-case.pdf');
  const fileUrl = 'file://' + pdfPath.replace(/\\/g, '/');

  console.log('Navigating to PDF at:', fileUrl);
  await page.goto(fileUrl);
  await page.waitForTimeout(2000);

  const outPath = path.resolve('scratch/evidence-case-h-exact-sez.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved screenshot of Case H exact PDF to:', outPath);

  // Also copy to artifact directory for evidence
  const artifactDir = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';
  const artifactPath = path.join(artifactDir, 'evidence-case-h-exact-sez.png');
  fs.copyFileSync(outPath, artifactPath);
  console.log('Saved artifact evidence to:', artifactPath);

  await browser.close();
}

renderScreenshot().catch((err) => {
  console.error('Failed to render screenshot:', err);
  process.exit(1);
});
