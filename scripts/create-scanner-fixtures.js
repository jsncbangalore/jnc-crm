const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const fixturesDir = path.resolve(__dirname, 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

async function createFixtures() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Fake bill HTML content (Strictly NO real names, GSTIN, phone or email)
  const billHtmlPage1 = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #111; background: #fff; width: 800px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; margin: 0; }
        .details { font-size: 14px; margin-top: 6px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
        th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; }
        th { background: #eee; font-weight: bold; }
        .text-right { text-align: right; }
        .total-box { margin-top: 20px; float: right; width: 300px; font-size: 14px; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .grand-total { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 6px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="title">VERTEX COMPONENTS ENTERPRISE</h1>
        <div class="details">GSTIN: 29AAAAA0000A1Z5 | State: Karnataka</div>
        <div class="details">Industrial Area, Peenya, Bangalore - 560058</div>
      </div>
      <div class="meta">
        <div>
          <strong>Billed To:</strong><br>
          JNC Solutions Private Limited<br>
          GSTIN: 29BBBBB0000B1Z6
        </div>
        <div>
          <strong>Tax Invoice No:</strong> INV-9842<br>
          <strong>Date:</strong> 25/10/2026<br>
          <strong>Due Date:</strong> 05/11/2026
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item Description</th>
            <th>HSN</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate (₹)</th>
            <th class="text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>10k Resistor 0805 SMD 1%</td>
            <td>8533</td>
            <td class="text-right">100</td>
            <td class="text-right">2.50</td>
            <td class="text-right">250.00</td>
          </tr>
          <tr>
            <td>2</td>
            <td>0.1uF Ceramic Capacitor 50V</td>
            <td>8532</td>
            <td class="text-right">50</td>
            <td class="text-right">4.00</td>
            <td class="text-right">200.00</td>
          </tr>
        </tbody>
      </table>
      <div class="total-box">
        <div class="total-row"><span>Subtotal:</span><span>₹ 450.00</span></div>
        <div class="total-row"><span>CGST @ 9%:</span><span>₹ 40.50</span></div>
        <div class="total-row"><span>SGST @ 9%:</span><span>₹ 40.50</span></div>
        <div class="total-row grand-total"><span>Total Amount:</span><span>₹ 531.00</span></div>
      </div>
    </body>
    </html>
  `;

  // Page 2 HTML for Add Page test
  const billHtmlPage2 = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #111; background: #fff; width: 800px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: bold; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
        th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; }
        th { background: #eee; font-weight: bold; }
        .text-right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 class="title">VERTEX COMPONENTS ENTERPRISE - Page 2 (Annexure)</h2>
        <div>Invoice Ref: INV-9842</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item Description</th>
            <th>HSN</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate (₹)</th>
            <th class="text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>3</td>
            <td>100uF Electrolytic Capacitor 25V</td>
            <td>8532</td>
            <td class="text-right">20</td>
            <td class="text-right">15.00</td>
            <td class="text-right">300.00</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  // A. Generate fake_bill_photo.jpg (JPG photo)
  await page.setContent(billHtmlPage1);
  const photoPath = path.join(fixturesDir, 'fake_bill_photo.jpg');
  await page.screenshot({ path: photoPath, type: 'jpeg', quality: 95 });
  console.log('Created:', photoPath);

  // B. Generate fake_bill_text.pdf (text-based PDF)
  const textPdfPath = path.join(fixturesDir, 'fake_bill_text.pdf');
  await page.pdf({ path: textPdfPath, printBackground: true, format: 'A4' });
  console.log('Created:', textPdfPath);

  // C. Generate fake_bill_scanned.pdf (scanned image-only PDF)
  const photoDataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(photoPath).toString('base64');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#fff;">
      <img src="${photoDataUrl}" style="width:100%; display:block;" />
    </body>
    </html>
  `);
  const scannedPdfPath = path.join(fixturesDir, 'fake_bill_scanned.pdf');
  await page.pdf({ path: scannedPdfPath, printBackground: true, format: 'A4' });
  console.log('Created:', scannedPdfPath);

  // D. Generate fake_bill_page2.jpg
  await page.setContent(billHtmlPage2);
  const page2Path = path.join(fixturesDir, 'fake_bill_page2.jpg');
  await page.screenshot({ path: page2Path, type: 'jpeg', quality: 95 });
  console.log('Created:', page2Path);

  // E. Generate fake_bill_blank.jpg (blank unreadable image)
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0; width:600px; height:800px; background:#fafafa;"></body>
    </html>
  `);
  const blankPath = path.join(fixturesDir, 'fake_bill_blank.jpg');
  await page.screenshot({ path: blankPath, type: 'jpeg', quality: 90 });
  console.log('Created:', blankPath);

  await browser.close();

  // F. Generate password-protected PDF
  // A valid standard PDF with /Encrypt dictionary causing PasswordException
  const protectedPdfBytes = Buffer.from(
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< /Filter /Standard /V 1 /R 2 /O (12345678901234567890123456789012) /U (12345678901234567890123456789012) /P -64 >>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000186 00000 n 
trailer
<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<12345678901234567890123456789012><12345678901234567890123456789012>] >>
startxref
305
%%EOF`
  );
  const protectedPdfPath = path.join(fixturesDir, 'fake_bill_protected.pdf');
  fs.writeFileSync(protectedPdfPath, protectedPdfBytes);
  console.log('Created:', protectedPdfPath);
}

createFixtures()
  .then(() => console.log('All fixtures created successfully.'))
  .catch((err) => {
    console.error('Fixture creation failed:', err);
    process.exit(1);
  });
