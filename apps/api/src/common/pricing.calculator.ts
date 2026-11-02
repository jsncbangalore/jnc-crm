/**
 * Shared GST & Document Pricing Calculator
 *
 * Implements GST per line item (taxRate, hsnCode, discount, quantity, unitPrice)
 * and computes document-level totals (subtotal, CGST, SGST, IGST, totalAmount).
 *
 * Rules:
 * - Intra-state (customer state matches seller state): CGST = gstRate/2, SGST = gstRate/2, IGST = 0
 * - Inter-state (customer state != seller state) or SEZ: IGST = gstRate, CGST = 0, SGST = 0
 * - SEZ under LUT: Zero billed tax (billed total = taxable)
 */

export interface LinePricingInput {
  skuId?: string | null;
  hsnCode?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discount?: number; // flat discount amount or 0
  taxRate?: number; // GST rate percentage (e.g. 18, 12, 5, 28, 0)
  gstRate?: number;
}

export interface CalculatedLineItem {
  skuId?: string | null;
  hsnCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableAmount: number;
  taxRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  lineTotal: number;
}

export interface CalculatedDocumentTotals {
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
  roundOff: number;
  lines: CalculatedLineItem[];
}

export function isStateInterState(
  customerState: string = 'Karnataka',
  sellerState: string = 'Karnataka',
  isSez: boolean = false
): boolean {
  if (isSez) return true;
  const cState = (customerState || '').trim().toLowerCase();
  const sState = (sellerState || 'karnataka').trim().toLowerCase();
  
  // Normalize Karnataka state codes
  const isKaCustomer = cState === 'karnataka' || cState === 'ka' || cState === '29';
  const isKaSeller = sState === 'karnataka' || sState === 'ka' || sState === '29';

  return isKaCustomer !== isKaSeller;
}

export function calculateLineGst(
  line: LinePricingInput,
  customerState: string = 'Karnataka',
  sellerState: string = 'Karnataka',
  isSez: boolean = false
): CalculatedLineItem {
  const qty = Math.max(1, Math.round(Number(line.quantity) || 1));
  const rate = Math.max(0, Number(line.unitPrice) || 0);
  const disc = Math.max(0, Number(line.discount) || 0);
  const gst = Number(line.gstRate ?? line.taxRate ?? 18.0);

  const taxableAmount = Math.max(0, Number((qty * rate - disc).toFixed(2)));
  const interState = isStateInterState(customerState, sellerState, isSez);

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;
  let totalTax = 0;

  if (isSez) {
    // Zero rated under LUT for billed total, but record statutory IGST rate
    igstRate = gst;
    igstAmount = Number(((taxableAmount * gst) / 100).toFixed(2));
    totalTax = 0;
  } else if (interState) {
    igstRate = gst;
    igstAmount = Number(((taxableAmount * gst) / 100).toFixed(2));
    totalTax = igstAmount;
  } else {
    cgstRate = Number((gst / 2).toFixed(2));
    sgstRate = Number((gst / 2).toFixed(2));
    cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
    sgstAmount = Number(((taxableAmount * sgstRate) / 100).toFixed(2));
    totalTax = Number((cgstAmount + sgstAmount).toFixed(2));
  }

  const lineTotal = Number((taxableAmount + totalTax).toFixed(2));

  return {
    skuId: line.skuId || null,
    hsnCode: (line.hsnCode || '85184000').trim(),
    description: (line.description || 'System Component / Service').trim(),
    quantity: qty,
    unitPrice: rate,
    discount: disc,
    taxableAmount,
    taxRate: gst,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTax,
    lineTotal,
  };
}

export function calculateDocumentTotals(
  lines: LinePricingInput[],
  customerState: string = 'Karnataka',
  sellerState: string = 'Karnataka',
  isSez: boolean = false
): CalculatedDocumentTotals {
  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  const calculatedLines: CalculatedLineItem[] = lines.map((l) => {
    const item = calculateLineGst(l, customerState, sellerState, isSez);
    subtotal += item.taxableAmount;
    cgstAmount += item.cgstAmount;
    sgstAmount += item.sgstAmount;
    igstAmount += item.igstAmount;
    return item;
  });

  subtotal = Number(subtotal.toFixed(2));
  cgstAmount = Number(cgstAmount.toFixed(2));
  sgstAmount = Number(sgstAmount.toFixed(2));
  igstAmount = Number(igstAmount.toFixed(2));

  const totalTax = isSez ? 0 : Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
  const rawTotal = subtotal + totalTax;
  const totalAmount = Math.round(rawTotal);
  const roundOff = Number((totalAmount - rawTotal).toFixed(2));

  return {
    subtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    totalAmount,
    roundOff,
    lines: calculatedLines,
  };
}
