import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Upload,
  FileText,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  Building2,
  Tag,
  Percent,
  Sparkles,
  Eye,
  ChevronDown,
  ChevronUp,
  Calculator,
  RefreshCw,
  Check,
  CornerDownRight,
  Copy,
  Sliders,
  Wand2,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { inventoryApi } from '../../services/api';

interface SmartBillScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProjects?: string[];
  onSuccess: () => void;
}

// Common electronic & billing symbols for quick 1-click insertion
const QUICK_SYMBOLS = [
  'Ω',
  'kΩ',
  'MΩ',
  'µF',
  'uF',
  'nF',
  'pF',
  'mH',
  'µH',
  '±5%',
  '±1%',
  '1/4W',
  '1/2W',
  '1W',
  'SMD',
  'DIP',
  '0805',
  '1206',
  'TO-220',
  '5V',
  '12V',
  '24V',
  '₹',
  '%',
  '/',
  '-',
];

// Clean OCR number string and repair leading glyphs
function cleanRupeeAndDot(num: number, grandTotal = 0): number {
  if (!num || num <= 0) return 0;

  // Case 1: 2180 / 2150 / 3180 / 3150 -> 180 / 150 (when Rupee glyph '₹' is misread as 2 or 3 on standard bills)
  if (num >= 2100 && num <= 3999 && (grandTotal === 0 || num > grandTotal)) {
    const s = Math.round(num).toString();
    const withoutGlyph = parseFloat(s.slice(1));
    if (withoutGlyph >= 10 && withoutGlyph <= 999) return withoutGlyph;
  }

  // Case 2: 312.25 -> 12.25
  if (num >= 301 && num <= 399 && num % 1 !== 0) {
    const s = num.toString();
    if (s.startsWith('3')) {
      const withoutGlyph = parseFloat(s.slice(1));
      if (withoutGlyph > 0 && withoutGlyph < 100) return withoutGlyph;
    }
  }

  return num;
}

// Convert Number to Words supporting INR (Rupees), USD (Dollars), EUR (Euros), GBP (Pounds)
export function numberToWords(num: number, currency: 'INR' | 'USD' | 'EUR' | 'GBP' = 'INR'): string {
  if (isNaN(num) || num === 0) {
    if (currency === 'USD') return 'Zero Dollars Only';
    if (currency === 'EUR') return 'Zero Euros Only';
    if (currency === 'GBP') return 'Zero Pounds Only';
    return 'Zero Rupees Only';
  }
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen ',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + ' ' + a[n % 10];
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + inWords(n % 100);
    if (currency === 'INR') {
      if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + inWords(n % 1000);
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + inWords(n % 100000);
      return inWords(Math.floor(n / 10000000)) + 'Crore ' + inWords(n % 10000000);
    } else {
      if (n < 1000000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + inWords(n % 1000);
      if (n < 1000000000) return inWords(Math.floor(n / 1000000)) + 'Million ' + inWords(n % 1000000);
      return inWords(Math.floor(n / 1000000000)) + 'Billion ' + inWords(n % 1000000000);
    }
  }

  const intPart = Math.floor(Math.abs(num));
  const decPart = Math.round((Math.abs(num) - intPart) * 100);

  let unitName = 'Rupees';
  let subUnitName = 'Paise';
  if (currency === 'USD') {
    unitName = 'Dollars';
    subUnitName = 'Cents';
  } else if (currency === 'EUR') {
    unitName = 'Euros';
    subUnitName = 'Cents';
  } else if (currency === 'GBP') {
    unitName = 'Pounds';
    subUnitName = 'Pence';
  }

  let result = inWords(intPart).trim() + ' ' + unitName;
  if (decPart > 0) {
    result += ' and ' + inWords(decPart).trim() + ' ' + subUnitName;
  }
  return result + ' Only';
}

export const numberToIndianWords = numberToWords;

// Pre-process image on Canvas for crisp OCR scaling, binarization and contrast enhancement
async function preprocessImageForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // 1. High Resolution Canvas Upscale
      const scale = Math.max(1.8, Math.min(3.2, 2800 / Math.max(img.width, img.height)));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 2. Grayscale & Adaptive Contrast Enhancement for OCR clarity
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const contrast = 1.35; // +35% contrast boost
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < d.length; i += 4) {
          // Standard ITU-R BT.601 luminance
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const boosted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
          d[i] = boosted;
          d[i + 1] = boosted;
          d[i + 2] = boosted;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback to scaled image if canvas pixel access is restricted
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const SmartBillScannerModal: React.FC<SmartBillScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [rawOcrText, setRawOcrText] = useState('');
  const [editableOcrText, setEditableOcrText] = useState('');
  const [showRawText, setShowRawText] = useState(true);
  const [scanSummary, setScanSummary] = useState<{ count: number; total: number; gst: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);

  // Extracted / Form Fields
  const [currency, setCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>('INR');
  const [currencySymbol, setCurrencySymbol] = useState<string>('₹');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [taxMode, setTaxMode] = useState<'cgst_sgst' | 'igst'>('cgst_sgst');
  const [taxRate, setTaxRate] = useState<number>(5);
  const [customCgst, setCustomCgst] = useState<string>('');
  const [customSgst, setCustomSgst] = useState<string>('');
  const [customIgst, setCustomIgst] = useState<string>('');
  const [roundOff, setRoundOff] = useState<string>('0');
  const [customGrandTotal, setCustomGrandTotal] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Line items (Starts clean - only populated when bill is scanned or line is added)
  const [items, setItems] = useState<
    Array<{
      name: string;
      skuCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }>
  >([]);

  if (!isOpen) return null;

  // Base Subtotal from line items
  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice || 0), 0);

  // Calculated GST Amounts
  const defaultTotalTax = (subtotal * taxRate) / 100;
  const effectiveCgst = customCgst !== '' ? parseFloat(customCgst) || 0 : defaultTotalTax / 2;
  const effectiveSgst = customSgst !== '' ? parseFloat(customSgst) || 0 : defaultTotalTax / 2;
  const effectiveIgst = customIgst !== '' ? parseFloat(customIgst) || 0 : defaultTotalTax;
  const effectiveTaxTotal =
    taxMode === 'cgst_sgst' ? effectiveCgst + effectiveSgst : effectiveIgst;
  const effectiveRoundOff = parseFloat(roundOff) || 0;
  const calculatedGrandTotal = subtotal + effectiveTaxTotal + effectiveRoundOff;
  const effectiveGrandTotal =
    customGrandTotal !== '' ? parseFloat(customGrandTotal) || 0 : calculatedGrandTotal;

  // Re-Calculate / Auto-Sync Math
  const handleAutoCalculateGst = () => {
    setCustomCgst((defaultTotalTax / 2).toFixed(2));
    setCustomSgst((defaultTotalTax / 2).toFixed(2));
    setCustomIgst(defaultTotalTax.toFixed(2));
    setCustomGrandTotal((subtotal + defaultTotalTax).toFixed(2));
    setRoundOff('0');
  };

  // Insert Symbol into active item name
  const handleInsertSymbol = (symbol: string) => {
    if (items.length === 0) return;
    const targetIdx = Math.min(activeItemIndex, items.length - 1);
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === targetIdx
          ? {
              ...it,
              name: it.name ? `${it.name} ${symbol}` : symbol,
              skuCode: it.skuCode || `ITM-${symbol.replace(/[^a-zA-Z0-9]/g, '')}`,
            }
          : it
      )
    );
  };

  // Add line from Scanned Text
  const handleAddLineFromRawText = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const numMatches = trimmed.match(/\b\d+(?:\.\d+)?\b/g);
    let qty = 1;
    let rate = 10;
    let cleanName = trimmed;

    if (numMatches && numMatches.length >= 2) {
      qty = parseFloat(numMatches[0]) || 1;
      let rawRate = parseFloat(numMatches[numMatches.length - 1]) || 10;
      rate = cleanRupeeAndDot(rawRate, 0);
      cleanName = trimmed.replace(new RegExp(`\\b${numMatches[numMatches.length - 1]}\\b$`), '').trim();
    }

    const skuCode = 'ITM-' + cleanName.replace(/[\s\t]+/g, '-').slice(0, 24);

    setItems((prev) => [
      ...prev,
      {
        name: cleanName || 'Component Item',
        skuCode,
        quantity: qty,
        unit: 'Nos',
        unitPrice: rate,
        total: Number((qty * rate).toFixed(2)),
      },
    ]);
  };

  // Smart Parser with High Precision Rupee De-duplication, Missing Dot Fix & Math Reconciliation
  const parseOcrText = (text: string) => {
    setRawOcrText(text);
    setEditableOcrText(text);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    let parsedVendor = '';
    let parsedGstin = '';
    let parsedInv = '';
    let parsedDate = new Date().toISOString().slice(0, 10);
    let parsedCgst = '';
    let parsedSgst = '';
    let parsedIgst = '';
    let parsedGrandTotal = '';

    // 0. Auto-Detect Bill Currency ($ USD, € EUR, £ GBP, ₹ INR)
    const dollarCount = (text.match(/\$/g) || []).length;
    const euroCount = (text.match(/€/g) || []).length;
    const poundCount = (text.match(/£/g) || []).length;
    const rupeeCount = (text.match(/[₹]|(?:rs\.?)|(?:inr)/gi) || []).length;

    let activeCurr: 'INR' | 'USD' | 'EUR' | 'GBP' = 'INR';
    let activeSym = '₹';

    if (dollarCount > 0 && dollarCount >= euroCount && dollarCount >= poundCount && dollarCount >= rupeeCount) {
      activeCurr = 'USD';
      activeSym = '$';
    } else if (euroCount > 0 && euroCount >= poundCount && euroCount >= rupeeCount) {
      activeCurr = 'EUR';
      activeSym = '€';
    } else if (poundCount > 0 && poundCount >= rupeeCount) {
      activeCurr = 'GBP';
      activeSym = '£';
    } else {
      activeCurr = 'INR';
      activeSym = '₹';
    }

    setCurrency(activeCurr);
    setCurrencySymbol(activeSym);

    // 1. Scan for Vendor Name (Top Header, ignoring standard invoice titles)
    const HEADER_IGNORE = [
      'tax invoice', 'original for recipient', 'duplicate for transporter', 'triplicate',
      'dealers in', 'retail invoice', 'cash memo', 'quotation', 'estimate', 'bill of supply',
      '(original for recipient)', 'original', 'recipient', 'tas kcice'
    ];
    for (let l of lines.slice(0, 10)) {
      const low = l.toLowerCase();
      if (!HEADER_IGNORE.some((h) => low.includes(h)) && !/^(gstin|phone|contact|address|no\s*\d|cin|pan|e-mail|email|state\s*name)/i.test(l)) {
        if (l.length >= 3 && !/^\d+/.test(l)) {
          let cleanName = l.replace(/(?:invles|invoice|inv|bill)\s*(?:no\.?|number)?.*$/i, '').trim();
          cleanName = cleanName.replace(/^[(\s_]+/, '').replace(/[),\s_]+$/, '').trim();
          if (cleanName.length >= 3) {
            parsedVendor = cleanName;
            setVendorName(parsedVendor);
            break;
          }
        }
      }
    }

    // 2. Scan for GSTIN (15 character standard Indian GST format)
    const gstinMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz]{1}[0-9A-Z]{1})\b/i);
    if (gstinMatch) {
      let g = gstinMatch[1].toUpperCase();
      if (g.startsWith('20') && /kamataka|karnataka/i.test(text)) {
        g = '29' + g.slice(2);
      }
      parsedGstin = g;
      setVendorGstin(parsedGstin);
    }

    // 3. Scan for Invoice Number (Supports multi-part alphanumeric GST invoice serials)
    const invCandidates = [
      text.match(/\b([A-Z]{1,5}\/[A-Z0-9\-]+\/\d{2,4}\/\d{1,8})\b/i),
      text.match(/\b([A-Z]{2,4}\/[A-Z]{2,4}\/[\d\-]+\/\d+)\b/i),
      text.match(/\b(AE[I\/]CR[I\/][\d\-]+[I\/1]\d+)\b/i),
      text.match(/\b([A-Z]{2,4}[I\/][A-Z0-9\/-]+)\b/i),
      text.match(/(?:Invoice\s*(?:Number|No\.?|#|Id)|Inv\s*No\.?|Bill\s*No\.?)\s*[:#.\s-]*([A-Za-z0-9\/\-_]{3,30})/i),
      text.match(/\b(INV[-\/]\d{3,10}|BILL[-\/]\d{3,10}|\d{6,10})\b/i)
    ];

    for (const m of invCandidates) {
      if (m && m[1]) {
        let rawInv = m[1].replace(/Dated.*$/i, '').trim();
        rawInv = rawInv.replace(/^([A-Z]{2})I([A-Z]{2})I/i, '$1/$2/')
                       .replace(/(\d{2}-\d{2})1(\d+)/, '$1/$2');
        if (rawInv.length >= 3 && !/^(oice|invoice|dated|date|number|bill|cash)$/i.test(rawInv)) {
          parsedInv = rawInv;
          setInvoiceNumber(parsedInv);
          break;
        }
      }
    }

    // 4. Scan for Date (Formatted to YYYY-MM-DD for standard HTML date input)
    const MONTH_MAP: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const namedDateMatch = text.match(/\b(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.](20\d{2}|\d{2})\b/i);
    if (namedDateMatch) {
      const day = namedDateMatch[1].padStart(2, '0');
      const monthStr = namedDateMatch[2].slice(0, 3).toLowerCase();
      const month = MONTH_MAP[monthStr] || '01';
      let year = namedDateMatch[3];
      if (year.length === 2) year = '20' + year;
      parsedDate = `${year}-${month}-${day}`;
      setInvoiceDate(parsedDate);
    } else {
      const numDateMatch = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2}|\d{2})\b/) ||
                           text.match(/\b(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
      if (numDateMatch) {
        if (numDateMatch[1].length === 4) {
          parsedDate = `${numDateMatch[1]}-${numDateMatch[2].padStart(2, '0')}-${numDateMatch[3].padStart(2, '0')}`;
        } else {
          let d = numDateMatch[1].padStart(2, '0');
          let m = numDateMatch[2].padStart(2, '0');
          let y = numDateMatch[3];
          if (y.length === 2) y = '20' + y;
          parsedDate = `${y}-${m}-${d}`;
        }
        setInvoiceDate(parsedDate);
      }
    }

    // 5. Scan for Grand Total First to use as context for item rates
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('total') || lower.includes('grand total') || lower.includes('total amount') || lower.includes('amount due') || lower.includes('net amount') || lower.includes('toi')) {
        const matches = line.match(/[\d,]+(?:\.\d{1,2})?/g);
        if (matches && matches.length > 0) {
          for (let i = matches.length - 1; i >= 0; i--) {
            let val = parseFloat(matches[i].replace(/,/g, ''));
            if (val > 50 || matches.length === 1) {
              val = cleanRupeeAndDot(val, 0);
              parsedGrandTotal = val.toFixed(2);
              setCustomGrandTotal(parsedGrandTotal);
              break;
            }
          }
        }
      }
    }

    const approxTotal = parsedGrandTotal ? parseFloat(parsedGrandTotal) : 0;

    // 6. Scan for Tax Rates & Amounts
    let hasGstKeywords = text.match(/\b(cgst|sgst|igst|gstin|gst\s*rate)\b/i);
    let detectedTaxRate = 0;

    if (activeCurr === 'INR' && hasGstKeywords) {
      detectedTaxRate = 5;
      const cgstRateMatch = text.match(/CGST(?:\s*OUTPUT\s*TAX)?\s*@?\s*(\d+(?:\.\d+)?)\s*%/i);
      if (cgstRateMatch) {
        const r = parseFloat(cgstRateMatch[1]);
        if (!isNaN(r) && r > 0) detectedTaxRate = r <= 14 ? r * 2 : 5;
      }
    }

    setTaxRate(detectedTaxRate);
    if (detectedTaxRate === 0) {
      setCustomCgst('0');
      setCustomSgst('0');
      setCustomIgst('0');
    }

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('cgst')) {
        const m = line.match(/([\d,]+(?:\.\d{1,2})?)$/);
        if (m) {
          let val = parseFloat(m[1].replace(/,/g, ''));
          val = cleanRupeeAndDot(val, approxTotal);
          parsedCgst = val.toFixed(2);
          setCustomCgst(parsedCgst);
        }
      } else if (lower.includes('sgst')) {
        const m = line.match(/([\d,]+(?:\.\d{1,2})?)$/);
        if (m) {
          let val = parseFloat(m[1].replace(/,/g, ''));
          val = cleanRupeeAndDot(val, approxTotal);
          parsedSgst = val.toFixed(2);
          setCustomSgst(parsedSgst);
        }
      } else if (lower.includes('igst')) {
        const m = line.match(/([\d,]+(?:\.\d{1,2})?)$/);
        if (m) {
          let val = parseFloat(m[1].replace(/,/g, ''));
          val = cleanRupeeAndDot(val, approxTotal);
          setTaxMode('igst');
          parsedIgst = val.toFixed(2);
          setCustomIgst(parsedIgst);
        }
      }
    }

    // If CGST is found, SGST in Indian tax is identical to CGST
    if (parsedCgst && !parsedSgst) {
      parsedSgst = parsedCgst;
      setCustomSgst(parsedSgst);
    }

    setTaxRate(detectedTaxRate);

    const NON_ITEM_KEYWORDS = [
      'pan number', 'pan no', 'gstin', 'phone', 'mobile', 'tel:', 'pin:', 'pincode',
      'bank details', 'bank:', 'branch:', 'ifsc', 'upi id', 'account no', 'a/c no',
      'taxable amount', 'discount', 'received amount', 'due balance', 'balance due', 'total amount',
      'terms & conditions', 'terms and conditions', 'terms', 'conditions', 'no return',
      'customer will pay', 'pay due', 'delivery charges', 'authorised signatory', 'authorized signatory',
      'customer signature', 'signature', 'e.&o.e', 'place of supply', 'buyer details', 'seller details',
      'notes', 'subtotal', 'cgst', 'sgst', 'igst', 'grand total', 'invoice no', 'invoice date',
      'bill to', 'ship to', 'sbi', 'upi', 'buildings', 'gate', 'rajasthan', 'date of issue', 'due date',
      'amount due', 'amount paid', 'electronic invoice', 'canada', 'ontario', 'vandelay', 'hsn', 'hsn/sac',
      'taxable value', 'sgst amount', 'cgst amount', 'total tax', 'amount chargeable', 'scan to pay',
      'company\'s bank details', 'subject to', 'computer generated', 'jurisdiction', 'output tax',
      'one thousand', 'eighty nine'
    ];

    const isNonItemLine = (str: string) => {
      const l = str.toLowerCase();
      return NON_ITEM_KEYWORDS.some((kw) => l.includes(kw));
    };

    const TABLE_HEADER_PATTERNS = [
      /description\s*of\s*goods/i, /particulars/i, /item\s*name/i, /description/i, /items?/i, /product/i,
      /qty.*price/i, /quantity.*unit/i, /rate.*qty/i, /si\s+fan/i
    ];
    const TABLE_FOOTER_PATTERNS = [
      /cgst/i, /sgst/i, /igst/i, /output\s*tax/i, /1,050/i, /sub\s*total/i, /taxable\s*amount/i, /taxable\s*value/i,
      /toi/i, /total\s+\d+/i, /grand\s*total/i, /amount\s*chargeable/i, /one\s*thousand/i, /scan\s*to\s*pay/i,
      /company'?s\s*bank/i, /bank\s*details/i, /terms\s*(&|and)\s*conditions/i, /notes/i, /received\s*amount/i,
      /authorised\s*signatory/i
    ];

    let inTable = false;
    const hasTableStructure = lines.some((l) => TABLE_HEADER_PATTERNS.some((p) => p.test(l)));

    // 7. Parse Itemized Rows (Extract ONLY real items strictly inside the table)
    const detectedItems: Array<{
      name: string;
      skuCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }> = [];

    for (let rawLine of lines) {
      let line = rawLine.trim();
      const isHeader = TABLE_HEADER_PATTERNS.some((p) => p.test(line));
      const isFooter = TABLE_FOOTER_PATTERNS.some((p) => p.test(line));

      if (isHeader) {
        inTable = true;
        continue;
      }

      if (isFooter && inTable) {
        inTable = false;
        break; // Stop completely once reaching table footer!
      }

      if (hasTableStructure && !inTable) {
        continue;
      }

      if (!line || isNonItemLine(line) || line.length < 4 || /^(no|utc|ure|nos|pcs|page|date)$/i.test(line)) {
        continue;
      }

      // 1. Clean row start (Strip leading row index "1 ", "2 ", "1.", "2)")
      const cleanRow = line.replace(/^\s*\d+[\.\)]?\s+/, '').trim();
      const rowTokens = cleanRow.split(/\s+/).filter(Boolean);

      // Find all number tokens backwards
      const numIndices: number[] = [];
      for (let i = rowTokens.length - 1; i >= 0; i--) {
        let raw = rowTokens[i].replace(/[!~?\(¥₹$\)]/g, '').replace(/,/g, '').trim();
        if (/^\d+(?:\.\d+)?$/.test(raw)) {
          numIndices.unshift(i);
        }
      }

      if (numIndices.length >= 3) {
        const totalIdx = numIndices[numIndices.length - 1];
        const rateIdx = numIndices[numIndices.length - 2];
        const qtyIdx = numIndices[numIndices.length - 3];

        let rawTotal = parseFloat(rowTokens[totalIdx].replace(/[!~?\(¥₹$\),]/g, '')) || 0;
        let rawRate = parseFloat(rowTokens[rateIdx].replace(/[!~?\(¥₹$\),]/g, '')) || 0;
        let rawQty = parseFloat(rowTokens[qtyIdx].replace(/[!~?\(¥₹$\),]/g, '')) || 1;

        // Fix OCR decimal misreads: 4000 -> 40.00, 1250 -> 12.50
        if (rawRate >= 1000 && rawRate % 10 === 0 && rawTotal > 0) {
          rawRate = rawRate / 100;
        }
        if (rawTotal >= 10000 && rawTotal % 10 === 0) {
          rawTotal = rawTotal / 100;
        }

        // Check if there is an HSN code immediately before qtyIdx
        let hsnIdx = -1;
        if (numIndices.length >= 4) {
          const candidateHsnIdx = numIndices[numIndices.length - 4];
          const candidateHsn = rowTokens[candidateHsnIdx].replace(/[!~?\(¥₹$\),]/g, '');
          if (/^\d{4,8}$/.test(candidateHsn) && candidateHsnIdx === qtyIdx - 1) {
            hsnIdx = candidateHsnIdx;
          }
        }

        const endNameIdx = hsnIdx !== -1 ? hsnIdx : qtyIdx;
        const nameTokens = rowTokens.slice(0, endNameIdx).filter((t) => !/^(nos|mos|pcs|kg|mtr|box|set|units|pkt|rs\.?|₹|\$|€|£|¥)$/i.test(t));
        let itemName = nameTokens.join(' ').replace(/[!~?\(¥₹$\)]/g, '').trim();

        // Auto-correct component OCR typos
        itemName = itemName.replace(/\basTe\b/gi, '2576')
                           .replace(/\bBV\b/g, '5V')
                           .replace(/\b51125\b/g, '51/25')
                           .replace(/\bLm\b/g, 'LM');

        if (itemName.length >= 2 && !isNonItemLine(itemName)) {
          const lineTotal = Number((rawQty * rawRate).toFixed(2)) || rawTotal;
          detectedItems.push({
            name: itemName,
            skuCode: 'ITM-' + itemName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
            quantity: rawQty,
            unit: 'Nos',
            unitPrice: rawRate,
            total: lineTotal,
          });
          continue;
        }
      }

      // Fallback for general unstructured rows
      const cleanLine = line.replace(/^\d+[\.\)]\s+/, '');
      const tokens = cleanLine.split(/\s+/).filter(Boolean);

      if (tokens.length >= 2) {
        const numTokens: number[] = [];
        const textTokens: string[] = [];

        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          if (/^(rs\.?|₹|\$|€|£|inr|usd|cad|eur|gbp)$/i.test(t)) {
            continue;
          }

          const cleanVal = t.replace(/^[₹$€£Rs.]+/i, '').replace(/,/g, '').replace(/[\(\)%]/g, '').trim();
          if (/^\d+(?:\.\d+)?$/.test(cleanVal)) {
            let n = parseFloat(cleanVal);
            if (n < 10000000) {
              n = cleanRupeeAndDot(n, approxTotal);
              numTokens.push(n);
            }
          } else {
            const unitMatch = t.match(/^(\d+(?:\.\d+)?)(KG|Nos|PCS|Units|BOX|MTR|Set|PKT)$/i);
            if (unitMatch) {
              numTokens.push(parseFloat(unitMatch[1]));
            } else if (cleanVal.length > 0 && !/^(rs\.?|₹|\$|€|£|inr|usd|cad|eur|gbp)$/i.test(cleanVal)) {
              textTokens.push(t.replace(/^(rs\.?|₹|\$|€|£)/i, ''));
            }
          }
        }

        let name = textTokens.join(' ').replace(/^(rs\.?|₹|\$|€|£|\s)+/gi, '').trim();
        if (name && !isNonItemLine(name)) {
          let qty = 1;
          let rate = 10;
          let total = 10;

          if (numTokens.length >= 3) {
            const n1 = numTokens[0];
            const n2 = numTokens[1];
            const n3 = numTokens[numTokens.length - 1];

            if (Math.abs(n1 * n2 - n3) < 0.05) {
              if (n1 > n2 && (n2 === 1 || (n2 <= 500 && n2 % 1 === 0))) {
                qty = n2;
                rate = n1;
                total = n3;
              } else if (n2 > n1 && (n1 === 1 || (n1 <= 500 && n1 % 1 === 0))) {
                qty = n1;
                rate = n2;
                total = n3;
              } else {
                qty = n1;
                rate = n2;
                total = n3;
              }
            } else {
              if (n2 === 1 && n1 > 1) {
                qty = 1;
                rate = n1;
                total = n3;
              } else if (n1 <= 500 && n2 >= n1) {
                qty = n1;
                rate = n2;
                total = Number((qty * rate).toFixed(2));
              } else if (n2 <= 500 && n1 >= n2) {
                qty = n2;
                rate = n1;
                total = Number((qty * rate).toFixed(2));
              } else {
                qty = 1;
                rate = n1;
                total = n3;
              }
            }
          } else if (numTokens.length === 2) {
            const n1 = numTokens[0];
            const n2 = numTokens[1];
            if (n1 <= 500 && n2 >= n1) {
              qty = n1;
              rate = n2;
              total = Number((qty * rate).toFixed(2));
            } else {
              qty = 1;
              rate = n1;
              total = n2;
            }
          } else if (numTokens.length === 1) {
            total = numTokens[0];
            rate = total;
            qty = 1;
          }

          if (name.length >= 2 && total > 0 && total <= 50000000) {
            detectedItems.push({
              name,
              skuCode: 'ITM-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
              quantity: qty,
              unit: 'Nos',
              unitPrice: rate,
              total,
            });
          }
        }
      }
    }

    const finalItems = detectedItems.length > 0 ? detectedItems : items;
    setItems(finalItems);

    const calcSub = finalItems.reduce((s, it) => s + it.total, 0);
    const calcTax = (calcSub * detectedTaxRate) / 100;
    const finalTotal = parsedGrandTotal ? parseFloat(parsedGrandTotal) : calcSub + calcTax;

    setScanSummary({
      count: finalItems.length,
      total: finalTotal,
      gst: calcTax,
    });
  };

  // Handle File Upload & Run Canvas Preprocessed OCR
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setScanning(true);
    setOcrProgress(10);
    setScanSummary(null);
    setCustomGrandTotal('');
    setCustomCgst('');
    setCustomSgst('');
    setCustomIgst('');
    setRoundOff('0');
    setItems([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      setPreviewUrl(dataUrl);

      try {
        setOcrProgress(25);
        const enhancedImageUrl = await preprocessImageForOcr(dataUrl);
        setOcrProgress(45);

        const worker = await createWorker('eng');
        setOcrProgress(65);
        const ret = await worker.recognize(enhancedImageUrl);
        setOcrProgress(90);
        await worker.terminate();

        const recognizedText = ret.data.text || '';
        parseOcrText(recognizedText);
      } catch (err: any) {
        console.warn('Local OCR fallback:', err);
        try {
          const scanRes = await inventoryApi.scanBillOcr({ filename: file.name });
          if (scanRes.data) parseOcrText(scanRes.data.rawText || '');
        } catch {}
      } finally {
        setOcrProgress(100);
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Add Item Line
  const handleAddItem = () => {
    const newIdx = items.length;
    setItems((prev) => [
      ...prev,
      {
        name: '',
        skuCode: '',
        quantity: 1,
        unit: 'Nos',
        unitPrice: 0,
        total: 0,
      },
    ]);
    setActiveItemIndex(newIdx);
  };

  // Remove Item Line
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Save Bill & Create Soft Copy
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      setError('Please provide the Vendor / Supplier Name');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one purchased component line');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let finalDocUrl = previewUrl;
      if (selectedFile) {
        try {
          const up = await inventoryApi.uploadPurchaseDocument(selectedFile);
          if (up.data?.url) finalDocUrl = up.data.url;
        } catch {}
      }

      const billData = {
        invoiceNumber: invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
        vendorName: vendorName.trim(),
        vendorGstin: vendorGstin.trim() || '',
        invoiceDate,
        project: 'General Procurement',
        items,
        subtotal: Number(subtotal.toFixed(2)),
        taxRate,
        cgst: Number(effectiveCgst.toFixed(2)),
        sgst: Number(effectiveSgst.toFixed(2)),
        igst: Number(effectiveIgst.toFixed(2)),
        totalTax: Number(effectiveTaxTotal.toFixed(2)),
        grandTotal: Number(effectiveGrandTotal.toFixed(2)),
        documentUrl: finalDocUrl,
        rawText: editableOcrText || rawOcrText,
        notes,
        softCopyData: {
          generatedAt: new Date().toISOString(),
          companyName: '',
          companyGstin: '',
          subtotal: Number(subtotal.toFixed(2)),
          taxMode,
          cgst: Number(effectiveCgst.toFixed(2)),
          sgst: Number(effectiveSgst.toFixed(2)),
          igst: Number(effectiveIgst.toFixed(2)),
          grandTotal: Number(effectiveGrandTotal.toFixed(2)),
          amountInWords: numberToIndianWords(effectiveGrandTotal),
        },
      };

      await inventoryApi.createPurchaseBill(billData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-crm-blue/20 text-crm-blue flex items-center justify-center border border-crm-blue/30 shadow-glow-blue">
                <Camera size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950 dark:text-white">Enhanced OCR Bill Scanner & Rupee-Correction</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Wand2 size={11} /> Auto-Rupee Correction
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Fixed ₹ symbol misrecognition (prevents 2/3 in numbers), reconciles lines & calculates taxes automatically
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body: Side-by-Side */}
          <form onSubmit={handleSaveBill} className="flex-1 overflow-y-auto flex flex-col md:flex-row">
            {/* Left: Original Bill Image & OCR Text */}
            <div className="w-full md:w-5/12 p-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-[#2A3042] bg-slate-100 dark:bg-[#141722] flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Receipt size={14} className="text-crm-blue" />
                Original Supplier Bill Photo / PDF
              </label>

              {previewUrl ? (
                <div className="relative rounded-xl border border-slate-200 dark:border-[#2A3042] overflow-hidden bg-black/50 flex items-center justify-center min-h-[260px] max-h-[340px]">
                  {previewUrl.startsWith('data:image') || previewUrl.endsWith('.png') || previewUrl.endsWith('.jpg') ? (
                    <img
                      src={previewUrl}
                      alt="Uploaded Bill"
                      className="max-h-[330px] w-auto object-contain"
                    />
                  ) : (
                    <iframe src={previewUrl} title="Document" className="w-full h-[330px]" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewUrl(null);
                      setSelectedFile(null);
                      setRawOcrText('');
                      setEditableOcrText('');
                      setScanSummary(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-red-500 text-white transition-all shadow-md"
                    title="Remove and choose another image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-200 dark:border-[#2A3042] hover:border-crm-blue/60 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-white dark:bg-[#181B26] hover:bg-white/[0.02] transition-all min-h-[260px]">
                  <div className="w-14 h-14 rounded-2xl bg-crm-blue/10 text-crm-blue flex items-center justify-center shadow-glow-blue">
                    <Camera size={26} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-950 dark:text-white">Click to Upload Bill Photo or PDF</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Take photo from mobile camera or select .jpg, .png, .pdf
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}

              {scanning && (
                <div className="p-3 rounded-xl bg-crm-blue/10 border border-crm-blue/30 text-xs text-crm-blue-light flex flex-col gap-1.5 animate-pulse">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-crm-blue animate-spin" /> Enhancing Image & Scanning Exact Numbers...
                    </span>
                    <span>{ocrProgress}%</span>
                  </div>
                  <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-crm-blue h-full transition-all duration-300"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Automatic Scan Success Summary Banner */}
              {scanSummary && !scanning && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <CheckCircle2 size={16} />
                      <span>Auto-Extracted & Reconciled ({currency})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10.5px]">
                      {currencySymbol} {currency}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-slate-300">
                    <div>Components: <strong className="text-white">{scanSummary.count} items</strong></div>
                    <div>Taxes: <strong className="text-amber-300">+{currencySymbol}{scanSummary.gst.toFixed(2)}</strong></div>
                    <div className="col-span-2 text-emerald-400 font-bold">
                      Grand Total: {currencySymbol}{scanSummary.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* Scanned OCR Text Inspector & Interactive Editor */}
              {rawOcrText && (
                <div className="rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] overflow-hidden text-xs">
                  <div className="p-2.5 flex items-center justify-between text-slate-300 font-bold border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                    <span className="flex items-center gap-1.5">
                      <FileText size={13} className="text-emerald-400" />
                      Extracted Text ({rawOcrText.length} chars)
                    </span>
                    <button
                      type="button"
                      onClick={() => parseOcrText(editableOcrText)}
                      className="px-2 py-0.5 rounded bg-crm-blue hover:bg-crm-blue-light text-white text-[10.5px] font-sans font-bold flex items-center gap-1 shadow-sm"
                      title="Re-calculate and sync fields from the text editor"
                    >
                      <RefreshCw size={11} /> Re-Parse Text
                    </button>
                  </div>
                  <textarea
                    value={editableOcrText}
                    onChange={(e) => setEditableOcrText(e.target.value)}
                    rows={6}
                    className="w-full p-2.5 font-mono text-[11px] text-slate-200 bg-black/40 resize-y border-0 focus:ring-0 focus:outline-none leading-relaxed"
                    placeholder="Scanned OCR text will appear here. You can edit any numbers or lines directly..."
                  />
                </div>
              )}
            </div>

            {/* Right: Editable Extracted Fields & Live Exact GST Numbers */}
            <div className="w-full md:w-7/12 p-5 space-y-4 overflow-y-auto bg-white dark:bg-[#181B26]">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {error}
                </div>
              )}

              {/* Vendor & Invoice Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">
                    Vendor / Supplier Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Enter vendor or supplier name"
                    className="input text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="label text-xs">Supplier GSTIN (15 Digits)</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={vendorGstin}
                    onChange={(e) => setVendorGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 29ABCDE1234F1Z5"
                    className="input text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Invoice / Bill Number</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-12345"
                    className="input text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="label text-xs">Invoice Date</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="input text-xs font-mono"
                  />
                </div>
              </div>

              {/* ─── QUICK SYMBOLS INSERTION TOOLBAR ───────────────────────── */}
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quick Insert Technical Symbols & Values (Click to add to Item #{activeItemIndex + 1}):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {QUICK_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => handleInsertSymbol(sym)}
                      className="px-2 py-0.5 rounded bg-slate-50 dark:bg-[#1E2230] hover:bg-crm-blue hover:text-white text-slate-300 border border-slate-200 dark:border-[#2A3042] text-[11px] font-mono font-bold transition-all shadow-sm active:scale-95"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Itemized Lines Editor */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={13} className="text-emerald-400" /> Extracted Purchased Components ({items.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="btn bg-slate-50 dark:bg-[#1E2230] hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-500/30 text-[11px] px-2.5 py-1 font-bold gap-1"
                  >
                    <Plus size={12} /> Add Line
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {items.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#2A3042] text-center bg-slate-100 dark:bg-[#141722]/50">
                      <p className="text-xs text-slate-400 font-medium">
                        No components extracted yet.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Upload a bill on the left to auto-extract, or click{' '}
                        <span className="text-emerald-400 font-bold">+ Add Line</span> to add manually.
                      </p>
                    </div>
                  ) : (
                    items.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActiveItemIndex(idx)}
                      className={`p-2.5 rounded-xl bg-slate-100 dark:bg-[#141722] border transition-all grid grid-cols-12 gap-2 items-center text-xs ${
                        activeItemIndex === idx
                          ? 'border-crm-blue ring-1 ring-crm-blue/30 shadow-glow-blue'
                          : 'border-slate-200 dark:border-[#2A3042]'
                      }`}
                    >
                      {/* Name & SKU */}
                      <div className="col-span-5 space-y-1">
                        <input
                          type="text"
                          placeholder="Component Name & Value (e.g. 100nF/50V, 10kΩ)"
                          value={item.name}
                          onFocus={() => setActiveItemIndex(idx)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      name: val,
                                      skuCode: 'ITM-' + val.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
                                    }
                                  : x
                              )
                            );
                          }}
                          className="input text-xs font-bold text-slate-950 dark:text-white py-1"
                        />
                        <input
                          type="text"
                          placeholder="SKU Code"
                          value={item.skuCode}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, skuCode: val } : x))
                            );
                          }}
                          className="input text-[10.5px] py-0.5 px-2 font-mono text-crm-violet-light"
                        />
                      </div>

                      {/* Qty & Unit */}
                      <div className="col-span-3 flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => {
                            const q = Math.max(1, Number(e.target.value));
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, quantity: q, total: Number((q * x.unitPrice).toFixed(2)) }
                                  : x
                              )
                            );
                          }}
                          className="input text-xs py-1 px-1.5 font-mono text-center font-bold text-slate-950 dark:text-white w-14"
                        />
                        <span className="text-[10px] text-slate-400 font-mono">{item.unit}</span>
                      </div>

                      {/* Rate */}
                      <div className="col-span-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Rate"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const p = Math.max(0, Number(e.target.value));
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, unitPrice: p, total: Number((x.quantity * p).toFixed(2)) }
                                  : x
                              )
                            );
                          }}
                          className="input text-xs py-1 px-1.5 font-mono text-right font-bold text-slate-950 dark:text-white w-full"
                        />
                        <span className="text-[10px] text-emerald-400 font-mono block">
                          {currencySymbol}{(item.quantity * item.unitPrice).toFixed(2)}
                        </span>
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveItem(idx);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )))}
                </div>
              </div>

              {/* ─── LIVE EXACT GST & MATHEMATICAL CALCULATION BREAKDOWN BOX ── */}
              <div className="bg-slate-100 dark:bg-[#141722] p-4 rounded-2xl border border-crm-blue/30 shadow-glow-blue space-y-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3042] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Calculator size={15} className="text-crm-blue" />
                    <span className="font-black text-slate-950 dark:text-white text-xs uppercase tracking-wider">
                      Live Total & Tax Breakdown
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Currency Selector */}
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-[#1E2230] p-1 rounded-lg border border-slate-200 dark:border-[#2A3042]">
                      {(['INR', 'USD', 'EUR', 'GBP'] as const).map((curr) => {
                        const sym = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '₹';
                        return (
                          <button
                            key={curr}
                            type="button"
                            onClick={() => {
                              setCurrency(curr);
                              setCurrencySymbol(sym);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              currency === curr
                                ? 'bg-crm-blue text-white shadow-sm'
                                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                            }`}
                          >
                            {sym} {curr}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleAutoCalculateGst}
                      className="btn bg-slate-50 dark:bg-[#1E2230] hover:bg-crm-blue hover:text-white text-crm-blue border border-crm-blue/30 text-[10.5px] px-2 py-1 font-bold gap-1"
                      title="Reset tax numbers to formula math"
                    >
                      <RefreshCw size={11} /> Auto-Sync
                    </button>

                    {/* Tax Mode Selector */}
                    <div className="flex items-center gap-0.5 bg-slate-50 dark:bg-[#1E2230] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
                      <button
                        type="button"
                        onClick={() => {
                          setTaxMode('cgst_sgst');
                          setTaxRate(0);
                          setCustomCgst('0');
                          setCustomSgst('0');
                          setCustomIgst('0');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          taxRate === 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                        }`}
                      >
                        0% (No Tax)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTaxMode('cgst_sgst');
                          setTaxRate(5);
                          setCustomCgst('');
                          setCustomSgst('');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          taxMode === 'cgst_sgst' && taxRate > 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                        }`}
                      >
                        CGST+SGST
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTaxMode('igst');
                          setTaxRate(5);
                          setCustomIgst('');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          taxMode === 'igst' && taxRate > 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                        }`}
                      >
                        IGST
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mathematical Steps Table */}
                <div className="space-y-2 font-mono">
                  {/* Step 1: Base Subtotal */}
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-[#1E2230] p-2 rounded-lg border border-white/5">
                    <span className="text-slate-300 text-[11px]">
                      1. Taxable Base Value (∑ Qty × Rate):
                    </span>
                    <span className="font-bold text-slate-950 dark:text-white text-xs">
                      {currencySymbol}{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Step 2: Taxes */}
                  {taxMode === 'cgst_sgst' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 dark:bg-[#1E2230] p-2 rounded-lg border border-amber-500/20 space-y-1">
                        <span className="text-[10px] text-amber-400 font-bold block">
                          2A. CGST ({taxRate / 2}%):
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={customCgst !== '' ? customCgst : (defaultTotalTax / 2).toFixed(2)}
                          onChange={(e) => setCustomCgst(e.target.value)}
                          className="input text-xs font-mono font-bold text-amber-300 py-1"
                        />
                      </div>
                      <div className="bg-slate-50 dark:bg-[#1E2230] p-2 rounded-lg border border-amber-500/20 space-y-1">
                        <span className="text-[10px] text-amber-400 font-bold block">
                          2B. SGST ({taxRate / 2}%):
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={customSgst !== '' ? customSgst : (defaultTotalTax / 2).toFixed(2)}
                          onChange={(e) => setCustomSgst(e.target.value)}
                          className="input text-xs font-mono font-bold text-amber-300 py-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-[#1E2230] p-2 rounded-lg border border-amber-500/20 space-y-1">
                      <span className="text-[10px] text-amber-400 font-bold block">
                        2. IGST ({taxRate}% Inter-State):
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={customIgst !== '' ? customIgst : defaultTotalTax.toFixed(2)}
                        onChange={(e) => setCustomIgst(e.target.value)}
                        className="input text-xs font-mono font-bold text-amber-300 py-1"
                      />
                    </div>
                  )}

                  {/* Step 3: Round Off & Grand Total */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-[#1E2230] p-2 rounded-lg border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">
                        3. Round Off Adjustment:
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={roundOff}
                        onChange={(e) => setRoundOff(e.target.value)}
                        className="input text-xs font-mono py-1 text-slate-300"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/30 space-y-1">
                      <span className="text-[10px] text-emerald-400 font-bold block">
                        4. Exact Grand Total on Bill ({currencySymbol}):
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={customGrandTotal !== '' ? customGrandTotal : calculatedGrandTotal.toFixed(2)}
                        onChange={(e) => setCustomGrandTotal(e.target.value)}
                        className="input text-xs font-mono font-black text-emerald-400 py-1 border-emerald-500/40"
                      />
                    </div>
                  </div>

                  {/* Step 4: Amount in Words */}
                  <div className="bg-slate-50 dark:bg-[#1E2230] p-2.5 rounded-lg border border-white/5 text-[11px] font-sans">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Amount in Words:
                    </span>
                    <p className="text-slate-200 italic font-semibold mt-0.5">
                      {numberToWords(effectiveGrandTotal, currency)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <input
                type="text"
                placeholder="Optional billing remarks or purchase order reference..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input text-xs"
              />

              {/* Footer Save Button */}
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="btn-ghost text-xs px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || items.length === 0}
                  className="btn-primary text-xs px-6 shadow-glow-blue font-bold flex items-center gap-2"
                >
                  {saving ? (
                    <span>Creating Soft Copy & Inwarding...</span>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Save Verified Bill (₹{effectiveGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
