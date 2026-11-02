/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface LutValidationResult {
  isExpired: boolean;
  isExpiringSoon: boolean; // within 30 days
  daysRemaining: number;
  expiryDateStr: string | null;
  expiryDate: Date | null;
  lutBondNo: string;
  warningMessage: string | null;
  severity: 'expired' | 'expiring_soon' | 'valid' | 'unknown';
}

/**
 * Parses the end date from an LUT validity string such as:
 * - "From : 10/05/2025 To: 09/05/2026"
 * - "10/05/2025 to 09/05/2026"
 * - "Valid till: 31/03/2027"
 * - "09/05/2026"
 */
export function parseLutEndDate(lutValidity?: string): { expiryDate: Date | null; expiryDateStr: string | null } {
  if (!lutValidity || typeof lutValidity !== 'string') {
    return { expiryDate: null, expiryDateStr: null };
  }

  const str = lutValidity.trim();

  // Pattern 1: Look for date token following "to" / "till" / "until" / "through" / "end"
  const toMatch = str.match(/(?:to|till|until|validity|end|through)\s*:?\s*(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  let targetDateToken = toMatch ? toMatch[1] : null;

  // Pattern 2: If no explicit "to" keyword, extract all date-like tokens and pick the last one
  if (!targetDateToken) {
    const allDates = str.match(/\b\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g);
    if (allDates && allDates.length > 0) {
      targetDateToken = allDates[allDates.length - 1];
    }
  }

  if (!targetDateToken) {
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
      const day = String(isoDate.getDate()).padStart(2, '0');
      const month = String(isoDate.getMonth() + 1).padStart(2, '0');
      const year = isoDate.getFullYear();
      return { expiryDate: isoDate, expiryDateStr: `${day}/${month}/${year}` };
    }
    return { expiryDate: null, expiryDateStr: null };
  }

  // Parse DD/MM/YYYY or YYYY-MM-DD
  const parts = targetDateToken.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let day = 0, month = 0, year = 0;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      // DD/MM/YYYY
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
    }

    const expiryDate = new Date(year, month, day, 23, 59, 59, 999);
    if (!isNaN(expiryDate.getTime())) {
      const formattedDay = String(day).padStart(2, '0');
      const formattedMonth = String(month + 1).padStart(2, '0');
      const formattedYear = year;
      const expiryDateStr = `${formattedDay}/${formattedMonth}/${formattedYear}`;
      return { expiryDate, expiryDateStr };
    }
  }

  return { expiryDate: null, expiryDateStr: null };
}

/**
 * Validates whether the given LUT bond is active, expiring soon, or expired
 * relative to the invoice generation date (or today).
 */
export function validateLutStatus(
  lutBondNo: string = '',
  lutValidity?: string,
  referenceDate: Date | string = new Date()
): LutValidationResult {
  const bondNo = (lutBondNo || '').trim();
  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  const { expiryDate, expiryDateStr } = parseLutEndDate(lutValidity);

  if (!expiryDate) {
    return {
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: 999,
      expiryDateStr: null,
      expiryDate: null,
      lutBondNo: bondNo,
      warningMessage: null,
      severity: 'unknown',
    };
  }

  const diffMs = expiryDate.getTime() - refDate.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return {
      isExpired: true,
      isExpiringSoon: false,
      daysRemaining,
      expiryDateStr,
      expiryDate,
      lutBondNo: bondNo,
      warningMessage: `LUT bond ${bondNo} expired on ${expiryDateStr} -- confirm renewal before issuing this SEZ invoice.`,
      severity: 'expired',
    };
  } else if (daysRemaining <= 30) {
    return {
      isExpired: false,
      isExpiringSoon: true,
      daysRemaining,
      expiryDateStr,
      expiryDate,
      lutBondNo: bondNo,
      warningMessage: `LUT bond ${bondNo} expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (on ${expiryDateStr}) -- confirm renewal before issuing this SEZ invoice.`,
      severity: 'expiring_soon',
    };
  }

  return {
    isExpired: false,
    isExpiringSoon: false,
    daysRemaining,
    expiryDateStr,
    expiryDate,
    lutBondNo: bondNo,
    warningMessage: null,
    severity: 'valid',
  };
}
