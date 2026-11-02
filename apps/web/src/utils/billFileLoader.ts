/**
 * Turns a bill file (photo, gallery image or PDF) into something the OCR can read.
 *
 * - Photos are shrunk (phone photos are huge) and rotated the right way up.
 * - PDFs are read page by page. If a page already has real text we use it
 *   directly (faster and exact); scanned PDFs are drawn to images for OCR.
 * - Anything we cannot read throws BillFileError with a message safe to show.
 * - pdf.js is loaded only when a PDF is chosen, so the main bundle stays small.
 */

export class BillFileError extends Error {}

export interface LoadedBill {
  /** One image (data URL) per page. Page 1 is always present, used for preview. */
  pages: string[];
  /** Real text found inside a text-based PDF. null means OCR is needed. */
  directText: string | null;
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_SIDE = 2400;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the phone's rotation information
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadImageFile(file: File): Promise<LoadedBill> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeImage(file);
  } catch {
    if (isHeic(file)) {
      throw new BillFileError(
        "This browser can't open HEIC photos. Use the Take photo button, or save the picture as JPG and try again.",
      );
    }
    throw new BillFileError("We couldn't open this image. Try a JPG or PNG, or take a new photo.");
  }

  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!w || !h) throw new BillFileError('This image looks empty. Please choose another one.');

  const ratio = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new BillFileError('Your browser could not prepare the image.');
  ctx.fillStyle = '#ffffff'; // PNGs with transparent background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  return { pages: [canvasToJpeg(canvas)], directText: null };
}

// Minimal shapes of the pdf.js objects we use (keeps the code typed without any)
interface PdfTextItem {
  str?: string;
  transform?: number[];
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

/** Rebuild readable lines from pdf.js text pieces (group by vertical position). */
function textItemsToLines(items: PdfTextItem[]): string {
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const y = Math.round(it.transform[5] / 3) * 3; // tolerate tiny baseline differences
    const row = rows.get(y) ?? [];
    row.push({ x: it.transform[4], s: it.str });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, r]) =>
      r
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join('  '),
    )
    .join('\n');
}

async function renderPdfPage(page: PdfPage): Promise<string> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1.5, MAX_SIDE / Math.max(base.width, base.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new BillFileError('Your browser could not prepare the PDF page.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvasToJpeg(canvas);
}

async function loadPdfFile(file: File): Promise<LoadedBill> {
  let doc: PdfDoc | null = null;
  try {
    // Legacy build works on older Android phones and older Safari
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const data = new Uint8Array(await file.arrayBuffer());
    try {
      doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'PasswordException') {
        throw new BillFileError('This PDF is password protected. Remove the password and try again.');
      }
      throw new BillFileError("We couldn't open this PDF. It may be damaged. Try saving it again.");
    }

    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    const texts: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      texts.push(textItemsToLines(content.items));
    }
    const joined = texts.join('\n').trim();
    const hasRealText = joined.replace(/\s/g, '').length >= 40;

    // Text PDF: only the first page is drawn (for the preview). Scanned PDF: draw all pages for OCR.
    const pages: string[] = [];
    for (let i = 1; i <= (hasRealText ? 1 : pageCount); i++) {
      pages.push(await renderPdfPage(await doc.getPage(i)));
    }
    return { pages, directText: hasRealText ? joined : null };
  } catch (e) {
    if (e instanceof BillFileError) throw e;
    console.warn('PDF read failed:', e);
    throw new BillFileError("We couldn't read this PDF. Try a clear photo of the bill instead.");
  } finally {
    if (doc) void doc.destroy();
  }
}

export async function loadBillFile(file: File): Promise<LoadedBill> {
  if (file.size === 0) throw new BillFileError('This file is empty. Please choose another one.');
  if (file.size > MAX_BYTES) {
    throw new BillFileError('This file is larger than 20 MB. Please choose a smaller file or a clearer, smaller photo.');
  }
  if (isPdf(file)) return loadPdfFile(file);
  if (file.type.startsWith('image/') || isHeic(file) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) {
    return loadImageFile(file);
  }
  throw new BillFileError('Please choose a photo (JPG, PNG) or a PDF.');
}
