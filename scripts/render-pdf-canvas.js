const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function renderPdfToPng(pdfPath, outPngPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBytes.toString('base64');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; background: #fff; display: flex; flex-direction: column; align-items: center; }
    canvas { box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 20px; }
  </style>
</head>
<body>
  <div id="container"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const raw = atob("${pdfBase64}");
    const uint8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      uint8Array[i] = raw.charCodeAt(i);
    }

    pdfjsLib.getDocument({ data: uint8Array }).promise.then(async function(pdf) {
      const container = document.getElementById('container');
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        container.appendChild(canvas);

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      }
      window.__PDF_RENDERED__ = true;
    }).catch(err => {
      console.error('Render error:', err);
      window.__PDF_ERROR__ = err.message;
    });
  </script>
</body>
</html>
  `;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });

  await page.setContent(html);
  await page.waitForFunction(() => window.__PDF_RENDERED__ || window.__PDF_ERROR__, { timeout: 15000 });

  const error = await page.evaluate(() => window.__PDF_ERROR__);
  if (error) {
    throw new Error('PDF.js rendering error: ' + error);
  }

  const container = await page.$('#container');
  await container.screenshot({ path: outPngPath });
  console.log(`Successfully rendered PDF to PNG: ${outPngPath}`);

  await browser.close();
}

renderPdfToPng(
  path.resolve('scratch/test-pdf-h-exact-case.pdf'),
  path.resolve('scratch/evidence-case-h-exact-sez.png')
).then(() => {
  // Copy to brain artifact directory
  const artifactDir = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';
  fs.copyFileSync(
    path.resolve('scratch/evidence-case-h-exact-sez.png'),
    path.join(artifactDir, 'evidence-case-h-exact-sez.png')
  );
  console.log('Artifact saved successfully!');
}).catch(console.error);
