/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface DirectPrintOptions {
  title?: string;
  paperSize?: 'A4' | 'A5' | '4x6';
  orientation?: 'portrait' | 'landscape';
  monochrome?: boolean;
  copies?: number;
  customCss?: string;
}

/**
 * Executes a direct, sandboxed print job straight to the connected printer.
 * Uses an invisible DOM iframe rather than window.open to prevent popup blocking,
 * CSP script/stylesheet violations, and blank tab issues.
 */
export function executeDirectPrint(htmlContent: string, options: DirectPrintOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Remove any previous print sandbox iframe
      const oldFrame = document.getElementById('crm-direct-print-sandbox');
      if (oldFrame) {
        oldFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'crm-direct-print-sandbox';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc) {
        console.error('Direct print: Unable to access iframe document.');
        resolve(false);
        return;
      }

      const paperSize = options.paperSize || 'A4';
      let pageRule = '@page { size: A4 portrait !important; margin: 6mm 8mm !important; }';
      let sheetWidth = '100%';

      if (paperSize === 'A5') {
        pageRule = '@page { size: 148mm 210mm portrait !important; margin: 4mm !important; }';
        sheetWidth = '100%';
      } else if (paperSize === '4x6') {
        pageRule = '@page { size: 4in 6in portrait !important; margin: 2mm !important; }';
        sheetWidth = '100%';
      }

      const monochromeRule = options.monochrome
        ? `
          html, body, .invoice-box, * {
            filter: grayscale(100%) !important;
            color: #000000 !important;
            border-color: #000000 !important;
            box-shadow: none !important;
          }
        `
        : '';

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${options.title || 'Print_Job'}</title>
  <style>
    ${pageRule}

    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #000000;
      font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: ${paperSize === '4x6' ? '9px' : paperSize === 'A5' ? '9.5px' : '10.5px'};
      line-height: 1.25;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .print-sheet {
      width: ${sheetWidth};
      max-width: 194mm;
      margin: 0 auto;
      background: #ffffff;
      box-sizing: border-box;
      border: 1.5px solid #000000 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .print-sheet-break {
      page-break-before: always !important;
      break-before: page !important;
    }

    table {
      width: 100% !important;
      border-collapse: collapse !important;
      border-spacing: 0 !important;
    }

    th, td {
      border: 1px solid #000000;
      padding: 2.5px 4.5px !important;
      box-sizing: border-box !important;
    }

    /* Strict logo constraint to prevent wallpaper/image explosion */
    img, [alt*="logo" i], [alt*="Logo" i] {
      max-height: 40px !important;
      max-width: 160px !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: inline-block !important;
    }

    img[alt*="Seal" i], img[alt*="stamp" i], img[alt*="Stamp" i] {
      max-height: 46px !important;
      max-width: 46px !important;
    }

    img[alt*="Signature" i], img[alt*="sign" i] {
      max-height: 36px !important;
      max-width: 120px !important;
    }

    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .flex-1 { flex: 1 1 0%; }

    .grid { display: grid; }
    .grid-cols-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .divide-x > * + * { border-left: 1px solid #000000 !important; }

    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }

    .font-normal { font-weight: 400; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    .uppercase { text-transform: uppercase; }
    .tracking-wide { letter-spacing: 0.025em; }
    .tracking-wider { letter-spacing: 0.05em; }

    .border { border: 1px solid #000000; }
    .border-b { border-bottom: 1px solid #000000 !important; }
    .border-t { border-top: 1px solid #000000 !important; }
    .border-r { border-right: 1px solid #000000 !important; }
    .border-l { border-left: 1px solid #000000 !important; }

    .p-0\\.5 { padding: 2px; }
    .p-1 { padding: 4px; }
    .p-1\\.5 { padding: 6px; }
    .p-2 { padding: 8px; }
    .p-3 { padding: 12px; }
    .p-4 { padding: 16px; }

    .px-1 { padding-left: 4px; padding-right: 4px; }
    .px-1\\.5 { padding-left: 6px; padding-right: 6px; }
    .px-2 { padding-left: 8px; padding-right: 8px; }
    .px-3 { padding-left: 12px; padding-right: 12px; }

    .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
    .py-1 { padding-top: 4px; padding-bottom: 4px; }
    .py-1\\.5 { padding-top: 6px; padding-bottom: 6px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }

    .space-y-0\\.5 > * + * { margin-top: 2px; }
    .space-y-1 > * + * { margin-top: 4px; }

    .bg-white { background-color: #ffffff; }
    .bg-gray-50 { background-color: #f9fafb; }
    .bg-gray-100 { background-color: #f3f4f6; }
    .bg-emerald-50 { background-color: #ecfdf5; }
    .bg-emerald-100 { background-color: #d1fae5; }

    .text-black { color: #000000; }
    .text-emerald-900 { color: #064e3b; }
    .italic { font-style: italic; }
    .whitespace-pre-line { white-space: pre-line; }

    @media print {
      @page {
        size: ${paperSize === 'A5' ? '148mm 210mm portrait' : paperSize === '4x6' ? '4in 6in portrait' : 'A4 portrait'} !important;
        margin: ${paperSize === 'A5' ? '4mm' : paperSize === '4x6' ? '2mm' : '6mm 8mm'} !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .print-sheet {
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        max-height: 275mm !important;
      }
      .print-sheet-break {
        page-break-before: always !important;
        break-before: page !important;
      }
    }

    ${monochromeRule}
    ${options.customCss || ''}
  </style>
</head>
<body class="p-0 m-0 bg-white">
  ${htmlContent}
</body>
</html>`;

      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();

      // Wait for images to be loaded
      const images = Array.from(frameDoc.images);
      const imagePromises = images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((imgResolve) => {
          img.onload = () => imgResolve();
          img.onerror = () => imgResolve();
        });
      });

      Promise.all(imagePromises).then(() => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (printErr) {
            console.error('Direct print execution failed:', printErr);
            resolve(false);
          } finally {
            setTimeout(() => {
              if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
              }
            }, 3000);
          }
        }, 150);
      });
    } catch (err) {
      console.error('Execute direct print error:', err);
      resolve(false);
    }
  });
}
