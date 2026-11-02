/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface SharedCartItem {
  id: string;
  skuCode: string;
  name: string;
  project: string;
  supplier: string;
  currentStock: number;
  quantityToBuy: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
}

export interface SharedCartPayload {
  title: string;
  date: string;
  items: SharedCartItem[];
}

/**
 * Encodes cart items into a compact, URL-safe Base64 string for live transfer in the URL
 */
export function encodeCartForUrl(items: SharedCartItem[], metaTitle?: string): string {
  try {
    const payload = {
      t: metaTitle || 'Procurement Component Purchase List',
      d: new Date().toISOString().split('T')[0],
      i: items.map((item) => ({
        c: item.skuCode || '',
        n: item.name || '',
        p: item.project || '',
        s: item.supplier || '',
        cs: Number(item.currentStock) || 0,
        q: Number(item.quantityToBuy) || 1,
        u: item.unit || 'Nos',
        pr: Number(item.unitPrice) || 0,
        tr: Number(item.taxRate ?? 18),
      })),
    };
    const jsonStr = JSON.stringify(payload);
    // URL-safe Base64
    const utf8Bytes = encodeURIComponent(jsonStr);
    return encodeURIComponent(btoa(unescape(utf8Bytes)));
  } catch (err) {
    console.error('Failed to encode cart for URL:', err);
    return '';
  }
}

/**
 * Decodes cart items from a URL-safe Base64 string
 */
export function decodeCartFromUrl(encodedStr: string): SharedCartPayload | null {
  if (!encodedStr || typeof encodedStr !== 'string') return null;
  try {
    const raw = decodeURIComponent(encodedStr);
    const decodedUtf8 = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(decodedUtf8);
    if (!parsed || !Array.isArray(parsed.i)) return null;

    const items: SharedCartItem[] = parsed.i.map((rawItem: any, idx: number) => ({
      id: `live-${idx}-${Date.now()}`,
      skuCode: String(rawItem.c || '').trim(),
      name: String(rawItem.n || '').trim(),
      project: String(rawItem.p || '').trim(),
      supplier: String(rawItem.s || '').trim(),
      currentStock: Number(rawItem.cs) || 0,
      quantityToBuy: Math.max(1, Number(rawItem.q) || 1),
      unit: String(rawItem.u || 'Nos').trim(),
      unitPrice: Number(rawItem.pr) || 0,
      taxRate: Number(rawItem.tr ?? 18),
    }));

    return {
      title: parsed.t || 'Procurement Component Purchase List',
      date: parsed.d || new Date().toISOString().split('T')[0],
      items,
    };
  } catch (err) {
    console.error('Failed to decode cart from URL:', err);
    return null;
  }
}
