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
  docType?: string;
  documentId?: string;
}

// Singleton print sandbox tracking ensuring strictly only one print frame exists at any time
let activePrintIframe: HTMLIFrameElement | null = null;
let activeSafetyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Removes any existing print sandbox iframe and clears active fallback timers.
 */
export function cleanupActivePrintFrame(): void {
  if (activeSafetyTimer) {
    clearTimeout(activeSafetyTimer);
    activeSafetyTimer = null;
  }
  if (activePrintIframe) {
    try {
      if (activePrintIframe.parentNode) {
        activePrintIframe.parentNode.removeChild(activePrintIframe);
      }
    } catch {
      // ignore
    }
    activePrintIframe = null;
  }
  if (typeof document !== 'undefined') {
    const existing = document.getElementById('crm-direct-print-sandbox');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }
}

/**
 * Detects phone or tablet user agents and touch form-factors where hidden-frame printing fails.
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouchDevice = Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
  return isMobileUa || (isTouchDevice && window.innerWidth < 1024);
}

/**
 * Executes a direct, sandboxed print job straight to the connected printer.
 * Uses an A4-sized off-screen DOM iframe (794x1123px) rather than 0x0/1x1.
 * Waits for fonts and images, triggers print once, and cleans up strictly on afterprint
 * or after a 2-minute (120000ms) safety window (NEVER after 3 seconds).
 * Guarantees only one print frame exists in the DOM at any time.
 */
export function executeDirectPrint(htmlContent: string, options: DirectPrintOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Guarantee only one print frame exists in the DOM at any time
      cleanupActivePrintFrame();

      const iframe = document.createElement('iframe');
      iframe.id = 'crm-direct-print-sandbox';
      iframe.style.position = 'fixed';
      iframe.style.top = '0px';
      iframe.style.left = '-9999px';
      // Real A4-sized dimensions at 96 DPI (794px x 1123px) so layout reflow matches print rasterizer
      iframe.style.width = '794px';
      iframe.style.height = '1123px';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      activePrintIframe = iframe;

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc) {
        console.error('Direct print: Unable to access iframe document.');
        cleanupActivePrintFrame();
        resolve(false);
        return;
      }

      const paperSize = options.paperSize || 'A4';
      let pageRule = '@page { size: A4 portrait !important; margin: 8mm 8mm !important; }';
      let sheetWidth = '100%';

      if (paperSize === 'A5') {
        pageRule = '@page { size: 148mm 210mm portrait !important; margin: 5mm !important; }';
        sheetWidth = '100%';
      } else if (paperSize === '4x6') {
        pageRule = '@page { size: 4in 6in portrait !important; margin: 3mm !important; }';
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

      // Collect stylesheets and styles from main document to preserve Tailwind utility styling
      const headLinks = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => `<link rel="stylesheet" href="${(link as HTMLLinkElement).href}">`)
            .join('\n')
        : '';
      const headStyles = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('style'))
            .map((style) => `<style>${style.innerHTML}</style>`)
            .join('\n')
        : '';

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${options.title || 'Print_Job'}</title>
  ${headLinks}
  ${headStyles}
  <style>
    ${pageRule}

    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      min-height: 100%;
      height: auto;
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
    }

    .print-sheet-break {
      page-break-before: always !important;
      break-before: page !important;
    }

    table {
      width: 100% !important;
      border-collapse: collapse !important;
      border-spacing: 0 !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }

    thead {
      display: table-header-group !important;
    }

    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
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
        margin: ${paperSize === 'A5' ? '5mm' : paperSize === '4x6' ? '3mm' : '8mm 8mm'} !important;
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
        max-height: none !important;
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

      // Safe cleanup function: removes frame only once
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        cleanupActivePrintFrame();
      };

      // Register afterprint cleanup handlers on both windows
      try {
        iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
      } catch {
        // Fallback gracefully if cross-origin access blocks listener
      }
      window.addEventListener('afterprint', cleanup, { once: true });

      // 2-minute safety removal timeout: NEVER remove after 3 seconds!
      activeSafetyTimer = setTimeout(cleanup, 120000);

      // Wait for all fonts and images to be completely ready before triggering print
      const fontPromise = (frameDoc as any).fonts?.ready || (document as any).fonts?.ready || Promise.resolve();

      const images = Array.from(frameDoc.images);
      const imagePromises = images.map((img) => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise<void>((imgResolve) => {
          img.onload = () => imgResolve();
          img.onerror = () => imgResolve();
        });
      });

      Promise.all([fontPromise, ...imagePromises]).then(() => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (printErr) {
            console.error('Direct print execution failed:', printErr);
            cleanup();
            resolve(false);
          }
        }, 150);
      });
    } catch (err) {
      console.error('Execute direct print error:', err);
      cleanupActivePrintFrame();
      resolve(false);
    }
  });
}
