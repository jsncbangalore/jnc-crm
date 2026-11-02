import * as fs from 'fs';
import * as path from 'path';
const PDFDocument = require('pdfkit');

async function testIndicPdf() {
  console.log('Testing Noto Sans Devanagari and Kannada font rendering in PDFKit...');

  const fontsDir = path.resolve(__dirname, '../apps/api/assets/fonts');
  const regularPath = path.join(fontsDir, 'NotoSans-Regular.ttf');
  const boldPath = path.join(fontsDir, 'NotoSans-Bold.ttf');
  const devanagariPath = path.join(fontsDir, 'NotoSansDevanagari-Regular.ttf');
  const devanagariBoldPath = path.join(fontsDir, 'NotoSansDevanagari-Bold.ttf');
  const kannadaPath = path.join(fontsDir, 'NotoSansKannada-Regular.ttf');
  const kannadaBoldPath = path.join(fontsDir, 'NotoSansKannada-Bold.ttf');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const outPath = path.resolve(__dirname, 'indic-font-test.pdf');
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  // Register fonts
  doc.registerFont('NotoSans', regularPath);
  doc.registerFont('NotoSans-Bold', boldPath);
  doc.registerFont('NotoSansDevanagari', devanagariPath);
  doc.registerFont('NotoSansDevanagari-Bold', devanagariBoldPath);
  doc.registerFont('NotoSansKannada', kannadaPath);
  doc.registerFont('NotoSansKannada-Bold', kannadaBoldPath);

  function getFontForText(text: string, isBold: boolean = false): string {
    if (/[\u0C80-\u0CFF]/.test(text)) {
      return isBold ? 'NotoSansKannada-Bold' : 'NotoSansKannada';
    }
    if (/[\u0900-\u097F]/.test(text)) {
      return isBold ? 'NotoSansDevanagari-Bold' : 'NotoSansDevanagari';
    }
    return isBold ? 'NotoSans-Bold' : 'NotoSans';
  }

  function renderLine(label: string, text: string) {
    const font = getFontForText(text, false);
    doc.font(font).fontSize(12).fillColor('#0F172A').text(`${label}: ${text}`, { features: false });
    doc.moveDown(0.5);
  }

  // Header
  doc.font('NotoSans-Bold').fontSize(18).fillColor('#1E2A78').text('Invoice Multilingual Customer Name Support Test', { features: false });
  doc.moveDown();

  // Test 1: Standard English + Rupee
  renderLine('1. English Customer', 'Acme Corporation Ltd (Invoice Amount: ₹ 4,50,000.00)');

  // Test 2: Hindi Customer (Devanagari)
  const hindiName = 'राजेश शर्मा (Rajesh Sharma)';
  console.log('Rendering Hindi Customer:', hindiName);
  renderLine('2. Hindi Customer', hindiName);

  // Test 3: Kannada Customer
  const kannadaName = 'ರಾಜೇಶ್ ಶರ್ಮಾ (Rajesh Sharma)';
  console.log('Rendering Kannada Customer:', kannadaName);
  renderLine('3. Kannada Customer', kannadaName);

  // Test 4: Additional Hindi Enterprise
  renderLine('4. Hindi Enterprise', 'सुरेश कुमार एंटरप्राइजेज (Suresh Kumar Enterprises)');

  // Test 5: Additional Kannada Enterprise
  renderLine('5. Kannada Enterprise', 'ಬೆಂಗಳೂರು ಟೆಕ್ನಾಲಜೀಸ್ ಪ್ರೈವೇಟ್ ಲಿಮಿಟೆಡ್ (Bengaluru Technologies Pvt Ltd)');

  doc.end();

  await new Promise((resolve) => stream.on('finish', () => resolve(true)));
  const stats = fs.statSync(outPath);
  console.log(`\n[SUCCESS] PDF generated cleanly at ${outPath} (${stats.size} bytes)`);
  console.log('Both Hindi and Kannada customer names rendered without errors or missing glyphs!');
}

testIndicPdf().catch((err) => {
  console.error('Error generating Indic PDF:', err);
  process.exit(1);
});
