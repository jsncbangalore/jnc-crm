/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface TaxBreakdown {
  taxableAmount: number;
  isInterState: boolean;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
}

export function calculateGst(
  taxableAmount: number,
  customerState: string = 'Karnataka',
  taxRatePercent: number = 18,
): TaxBreakdown {
  const normState = customerState.trim().toLowerCase();
  const isInterState = normState !== 'karnataka' && normState !== 'ka' && normState !== '29';

  if (isInterState) {
    const igstAmount = (taxableAmount * taxRatePercent) / 100;
    return {
      taxableAmount,
      isInterState: true,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRatePercent,
      igstAmount,
      totalTax: igstAmount,
      grandTotal: taxableAmount + igstAmount,
    };
  }

  const splitRate = taxRatePercent / 2;
  const cgstAmount = (taxableAmount * splitRate) / 100;
  const sgstAmount = (taxableAmount * splitRate) / 100;
  const totalTax = cgstAmount + sgstAmount;

  return {
    taxableAmount,
    isInterState: false,
    cgstRate: splitRate,
    cgstAmount,
    sgstRate: splitRate,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0,
    totalTax,
    grandTotal: taxableAmount + totalTax,
  };
}
