const { chromium } = require('playwright');
const fs = require('fs');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 1130 } });
  const pdfBytes = fs.readFileSync('scratch/test-notosans.pdf');
  const b64 = pdfBytes.toString('base64');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;overflow:hidden;background:#fff;">
        <iframe src="data:application/pdf;base64,${b64}#toolbar=0&navpanes=0" width="100%" height="1130px" style="border:none;"></iframe>
      </body>
    </html>
  `);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'scratch/test-embed-pdf.png' });
  console.log('Saved scratch/test-embed-pdf.png, size:', fs.statSync('scratch/test-embed-pdf.png').size);
  await browser.close();
}
test().catch(console.error);
