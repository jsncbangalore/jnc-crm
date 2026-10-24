/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { BRAND_CONFIG } from '../common/brand';

export interface CompanyInvoiceProfile {
  companyName: string;
  tradingName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  msmeUdyamNo: string;
  lutBondNo: string;
  lutValidity: string;
  bankDetails: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branch: string;
  };
}


export interface TaxBreakdown {
  taxableAmount: number;
  isInterState: boolean;
  isSez: boolean;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
  roundOff: number;
}

/**
 * Computes 100% accurate CGST + SGST vs IGST vs SEZ/LUT based on customer delivery state and SEZ flag
 */
export function calculateGst(
  taxableAmount: number,
  customerState: string = 'Karnataka',
  taxRatePercent: number = 18,
  isSez: boolean = false,
): TaxBreakdown {
  const normState = (customerState || '').trim().toLowerCase();
  const isInterState = normState !== 'karnataka' && normState !== 'ka' && normState !== '29';

  // If SEZ / Export with LUT, tax rate for reporting is computed but billed tax collected is 0
  if (isSez) {
    const theoreticalIgst = (taxableAmount * taxRatePercent) / 100;
    return {
      taxableAmount,
      isInterState: true,
      isSez: true,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRatePercent,
      igstAmount: theoreticalIgst, // Recorded for statutory SEZ summary table
      totalTax: 0, // Zero billed under LUT
      grandTotal: taxableAmount,
      roundOff: 0,
    };
  }

  if (isInterState) {
    const igstAmount = Number(((taxableAmount * taxRatePercent) / 100).toFixed(2));
    const rawTotal = taxableAmount + igstAmount;
    const rounded = Math.round(rawTotal);
    const roundOff = Number((rounded - rawTotal).toFixed(2));

    return {
      taxableAmount,
      isInterState: true,
      isSez: false,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRatePercent,
      igstAmount,
      totalTax: igstAmount,
      grandTotal: rawTotal,
      roundOff,
    };
  }

  // Intra-state (Karnataka): 50% CGST + 50% SGST
  const splitRate = taxRatePercent / 2;
  const cgstAmount = Number(((taxableAmount * splitRate) / 100).toFixed(2));
  const sgstAmount = Number(((taxableAmount * splitRate) / 100).toFixed(2));
  const totalTax = Number((cgstAmount + sgstAmount).toFixed(2));
  const rawTotal = taxableAmount + totalTax;
  const rounded = Math.round(rawTotal);
  const roundOff = Number((rounded - rawTotal).toFixed(2));

  return {
    taxableAmount,
    isInterState: false,
    isSez: false,
    cgstRate: splitRate,
    cgstAmount,
    sgstRate: splitRate,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0,
    totalTax,
    grandTotal: rawTotal,
    roundOff,
  };
}

/**
 * Indian Currency Number to Words Converter (Lakhs, Crores, Thousands, Paise)
 */
export function numberToIndianWords(amount: number): string {
  if (!amount || isNaN(amount)) return 'Zero Only';

  const single = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertChunk = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += single[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + single[n % 10] : '') + ' ';
    } else if (n > 0) {
      str += single[n] + ' ';
    }
    return str;
  };

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  const crore = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  const hundreds = remainder % 1000;

  let words = '';
  if (crore > 0) words += convertChunk(crore) + 'Crore ';
  if (lakh > 0) words += convertChunk(lakh) + 'Lakh ';
  if (thousand > 0) words += convertChunk(thousand) + 'thousand ';
  if (hundreds > 0) words += convertChunk(hundreds);

  words = words.trim();
  if (!words) words = 'Zero';

  words = words.charAt(0).toUpperCase() + words.slice(1);

  if (decimalPart > 0) {
    words += ' and ' + convertChunk(decimalPart).trim() + ' Paise';
  }
  return words + ' Only';
}
