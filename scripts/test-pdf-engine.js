const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

async function testEngine() {
  const regularFont = path.resolve('apps/api/assets/fonts/NotoSans-Regular.ttf');
  const boldFont = path.resolve('apps/api/assets/fonts/NotoSans-Bold.ttf');

  console.log('Regular font exists:', fs.existsSync(regularFont));
  console.log('Bold font exists:', fs.existsSync(boldFont));

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 28.35, bottom: 28.35, left: 28.35, right: 28.35 }
  });

  if (fs.existsSync(regularFont)) doc.registerFont('NotoSans', regularFont);
  if (fs.existsSync(boldFont)) doc.registerFont('NotoSans-Bold', boldFont);

  const bufs = [];
  doc.on('data', b => bufs.push(b));
  doc.on('end', () => {
    const finalBuf = Buffer.concat(bufs);
    fs.writeFileSync('scratch/test-engine-output.pdf', finalBuf);
    console.log('Test PDF generated, size:', finalBuf.length);
  });

  const fontFam = fs.existsSync(regularFont) ? 'NotoSans' : 'Helvetica';
  const boldFam = fs.existsSync(boldFont) ? 'NotoSans-Bold' : 'Helvetica-Bold';

  doc.font(boldFam).fontSize(14).text('TAX INVOICE ₹ 99,99,99,999.00', 28.35, 28.35);
  doc.font(fontFam).fontSize(9).text('Indian Currency Test: ₹ 1,23,456.78', 28.35, 50);

  doc.end();
}

testEngine().catch(console.error);
