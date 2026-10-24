/* --- CRM SHARED VALIDATION MODULE ---
 * Pure TypeScript functions, regexes, and normalization utilities.
 * Shared directly across Frontend (apps/web) and Backend (apps/api).
 * Zero runtime dependencies.
 * ------------------------------------ */

// 1. Text & HTML Sanitization
export const stripHtml = (val: string): string => {
  if (!val) return '';
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .trim();
};

export const removeControlCharacters = (val: string): string => {
  if (!val) return '';
  // Strip non-printable ASCII control characters (0x00-0x1F, 0x7F) except newline and tab
  return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

export const sanitizeText = (val: string): string => {
  if (typeof val !== 'string') return '';
  return removeControlCharacters(stripHtml(val)).trim();
};

// 2. Person & Company Name Rules
// Required, trim, 2-100 chars, letters of any language, digits, space, and . , & - ' ( ) / only, at least one letter
export const NAME_REGEX = /^[\p{L}\p{N}\s.,&\-'()\/]+$/u;
export const HAS_LETTER_REGEX = /\p{L}/u;
export const TEXT_ONLY_NAME_REGEX = /^[\p{L}\s.,&\-'()\/]+$/u;

// Filter text-only inputs (strips digits and disallowed symbols)
export const filterTextOnly = (val: string): string => {
  if (typeof val !== 'string') return '';
  return val.replace(/[0-9]/g, '').replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.,&'\-()\/]/g, '');
};

export const validatePersonOrCompanyName = (raw: string): { valid: boolean; error?: string; value: string } => {
  if (typeof raw !== 'string') return { valid: false, error: 'Name is required.', value: '' };
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    return { valid: false, error: 'Control characters are not allowed.', value: '' };
  }
  const value = sanitizeText(raw);
  if (!value) {
    return { valid: false, error: 'Name is required.', value };
  }
  if (value.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters.', value };
  }
  if (value.length > 100) {
    return { valid: false, error: 'Name cannot exceed 100 characters.', value };
  }
  if (!HAS_LETTER_REGEX.test(value)) {
    return { valid: false, error: 'Name must contain at least one letter.', value };
  }
  if (!NAME_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Name may only contain letters, digits, spaces, and . , & - \' ( ) /',
      value,
    };
  }
  return { valid: true, value };
};

export const validateTextOnlyName = (raw: string): { valid: boolean; error?: string; value: string } => {
  const base = validatePersonOrCompanyName(raw);
  if (!base.valid) return base;
  if (/[0-9\p{N}]/u.test(base.value)) {
    return { valid: false, error: 'Name must contain letters only (no numbers allowed).', value: base.value };
  }
  return base;
};

// 3. Mobile Phone Rules
// Clean +91, leading 0, spaces, dashes.
// Indian mobile: 10 digits starting 6-9.
// Other countries: 8-15 digits with leading + and country code.
export const cleanPhone = (raw: string): string => {
  if (!raw) return '';
  return raw.replace(/[\s\-\(\)\.]/g, '').trim();
};

export const normalizePhoneNumber = (raw: string): string => {
  let cleaned = cleanPhone(raw);
  // Handle Indian phone variations: +91, 0, or 91
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
};

export const validatePhone = (raw: string): { valid: boolean; error?: string; value: string } => {
  const cleaned = cleanPhone(raw);
  if (!cleaned) {
    return { valid: false, error: 'Phone number is required.', value: '' };
  }

  // If Indian mobile number (+91, 0, 91, or 10 digits starting 6-9)
  const indianNormalized = normalizePhoneNumber(cleaned);
  if (/^[6-9]\d{9}$/.test(indianNormalized)) {
    return { valid: true, value: indianNormalized };
  }

  // Check if international format with leading + (non-Indian)
  if (cleaned.startsWith('+')) {
    const intlDigits = cleaned.substring(1);
    if (!/^\d+$/.test(intlDigits)) {
      return { valid: false, error: 'Phone number may only contain digits.', value: cleaned };
    }
    if (intlDigits.length < 8 || intlDigits.length > 15) {
      return { valid: false, error: 'International phone numbers must be between 8 and 15 digits.', value: cleaned };
    }
    return { valid: true, value: cleaned };
  }

  if (!/^\d+$/.test(indianNormalized)) {
    return { valid: false, error: 'Phone number may only contain digits.', value: indianNormalized };
  }
  if (indianNormalized.length !== 10) {
    return {
      valid: false,
      error: `Phone number must be exactly 10 digits (received ${indianNormalized.length}).`,
      value: indianNormalized,
    };
  }
  return {
    valid: false,
    error: 'Indian mobile number must start with 6, 7, 8, or 9.',
    value: indianNormalized,
  };
};

// 4. Email Rules
// Trim, lowercase, max 254, valid domain with a dot
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const validateEmail = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim().toLowerCase();
  if (!value) {
    if (required) {
      return { valid: false, error: 'Email address is required.', value: '' };
    }
    return { valid: true, value: '' };
  }
  if (value.length > 254) {
    return { valid: false, error: 'Email address cannot exceed 254 characters.', value };
  }
  if (!EMAIL_REGEX.test(value)) {
    return { valid: false, error: 'Please enter a valid email address with a valid domain.', value };
  }
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) {
    return { valid: false, error: 'Email domain must contain a dot (e.g. domain.com).', value };
  }
  const tld = parts[1].split('.').pop();
  if (!tld || tld.length < 2) {
    return { valid: false, error: 'Email top-level domain must be at least 2 letters.', value };
  }
  return { valid: true, value };
};

// 5. Product Name Rules
// 2-150 chars, no control characters, no spam repetition (>= 15 identical consecutive chars)
export const validateProductName = (raw: string): { valid: boolean; error?: string; value: string } => {
  if (typeof raw !== 'string') return { valid: false, error: 'Product name is required.', value: '' };
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    return { valid: false, error: 'Control characters are not allowed in product name.', value: '' };
  }
  const value = sanitizeText(raw);
  if (!value) {
    return { valid: false, error: 'Product name is required.', value: '' };
  }
  if (value.length < 2) {
    return { valid: false, error: 'Product name must be at least 2 characters.', value };
  }
  if (value.length > 150) {
    return { valid: false, error: 'Product name cannot exceed 150 characters.', value };
  }
  // Check for abnormal character repetition (e.g. "aaaaa" or excessive repeating patterns)
  if (/^(.)\1{3,}$/.test(value) || /(.)\1{7,}/.test(value) || /^(.{2,4})\1{3,}$/.test(value)) {
    return { valid: false, error: 'Product name contains excessive repeated characters.', value };
  }
  return { valid: true, value };
};

// 6. SKU Rules
// Letters, digits, - _ . / (2-50 chars)
export const SKU_REGEX = /^[a-zA-Z0-9\-_.\\/]{2,50}$/;

export const validateSku = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'SKU is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!SKU_REGEX.test(value)) {
    return {
      valid: false,
      error: 'SKU must be 2-50 characters containing letters, digits, -, _, ., or / only.',
      value,
    };
  }
  return { valid: true, value };
};

// 7. Quantity Rules
// Greater than 0, max 100,000, integer unless unit allows decimals (up to 3 decimal places)
export const validateQuantity = (
  raw: number | string,
  allowDecimals = false
): { valid: boolean; error?: string; value: number } => {
  const str = String(raw).trim();
  if (!str) {
    return { valid: false, error: 'Quantity is required.', value: 0 };
  }
  // No exponent, no minus sign
  if (/[eE\-]/.test(str)) {
    return { valid: false, error: 'Exponents and negative quantities are not allowed.', value: 0 };
  }
  const num = Number(str);
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Quantity must be a valid number.', value: 0 };
  }
  if (num <= 0) {
    return { valid: false, error: 'Quantity must be greater than 0.', value: num };
  }
  if (num > 100000) {
    return { valid: false, error: 'Quantity cannot exceed 100,000.', value: num };
  }
  if (!allowDecimals) {
    if (!Number.isInteger(num)) {
      return { valid: false, error: 'Quantity must be a whole number for this item.', value: num };
    }
  } else {
    // Check up to 3 decimal places
    const decimalParts = str.split('.');
    if (decimalParts[1] && decimalParts[1].length > 3) {
      return { valid: false, error: 'Quantity can have at most 3 decimal places.', value: num };
    }
  }
  return { valid: true, value: num };
};

// 8. Unit Rate Rules
// Greater than 0, max 100,000,000 (10 crore), at most 2 decimals, no leading zeros ('02' invalid, '0.5' ok, '2' ok, '0' invalid), no exponent ('1e5' invalid), no minus ('-5' invalid)
export const UNIT_RATE_REGEX = /^(?:0\.\d{1,2}|[1-9]\d*(?:\.\d{1,2})?)$/;

export const validateUnitRate = (raw: number | string): { valid: boolean; error?: string; value: number } => {
  const str = String(raw).trim();
  if (!str) {
    return { valid: false, error: 'Unit rate is required.', value: 0 };
  }
  // Disallow scientific notation, minus, or negative values
  if (/[eE\-]/.test(str)) {
    return { valid: false, error: 'Exponents and negative rates are not allowed.', value: 0 };
  }
  if (!UNIT_RATE_REGEX.test(str)) {
    if (/^0[0-9]/.test(str)) {
      return { valid: false, error: 'Leading zeros are not allowed (e.g. enter 2 instead of 02).', value: 0 };
    }
    return { valid: false, error: 'Rate must be positive with at most 2 decimal places.', value: 0 };
  }
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    return { valid: false, error: 'Unit rate must be greater than 0.', value: 0 };
  }
  if (num > 100000000) {
    return { valid: false, error: 'Unit rate cannot exceed ₹10,00,00,000 (10 Crore).', value: num };
  }
  return { valid: true, value: num };
};

// 9. GST Rate Rules
export const ALLOWED_GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof ALLOWED_GST_RATES)[number];

export const validateGstRate = (raw: number | string): { valid: boolean; error?: string; value: GstRate } => {
  const num = Number(raw);
  if (ALLOWED_GST_RATES.includes(num as GstRate)) {
    return { valid: true, value: num as GstRate };
  }
  return {
    valid: false,
    error: `GST rate must be one of: ${ALLOWED_GST_RATES.join('%, ')}%`,
    value: 18,
  };
};

// 10. Address Rules
// Max 300 characters
export const validateAddress = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = sanitizeText(raw || '');
  if (!value) {
    if (required) return { valid: false, error: 'Address is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (value.length > 300) {
    return { valid: false, error: 'Address cannot exceed 300 characters.', value };
  }
  return { valid: true, value };
};

// 11. Notes Rules
// Max 1000 characters, HTML stripped
export const validateNotes = (raw?: string): { valid: boolean; error?: string; value: string } => {
  const value = sanitizeText(raw || '');
  if (value.length > 1000) {
    return { valid: false, error: 'Notes cannot exceed 1000 characters.', value: value.slice(0, 1000) };
  }
  return { valid: true, value };
};

// 12. Postal PIN Code Rules
// 6 digits (Indian PIN, not starting with 0)
export const PIN_REGEX = /^[1-9][0-9]{5}$/;

export const validatePostalPin = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'PIN code is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!PIN_REGEX.test(value)) {
    return { valid: false, error: 'PIN code must be exactly 6 digits starting with 1-9.', value };
  }
  return { valid: true, value };
};

// 13. GSTIN Rules
// 15 characters, valid checksum
export const GSTIN_FORMAT_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GSTIN_CHAR_SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const verifyGstinChecksum = (gstin: string): boolean => {
  if (gstin.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = GSTIN_CHAR_SET.indexOf(gstin[i]);
    if (val === -1) return false;
    const weight = (i % 2) + 1;
    const factor = val * weight;
    sum += Math.floor(factor / 36) + (factor % 36);
  }
  const checkCode = (36 - (sum % 36)) % 36;
  return gstin[14] === GSTIN_CHAR_SET[checkCode];
};

export const validateGstin = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'GSTIN is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!GSTIN_FORMAT_REGEX.test(value)) {
    return { valid: false, error: 'Invalid GSTIN format (15 characters: e.g. 29AAAAA0000A1ZY).', value };
  }
  if (!verifyGstinChecksum(value)) {
    return { valid: false, error: 'Invalid GSTIN checksum digit.', value };
  }
  return { valid: true, value };
};

// 14. PAN Rules
// 10 chars: 5 letters, 4 digits, 1 letter
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const validatePan = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'PAN is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!PAN_REGEX.test(value)) {
    return { valid: false, error: 'Invalid PAN format (10 characters: 5 letters, 4 digits, 1 letter).', value };
  }
  return { valid: true, value };
};

// 15. IFSC Rules
// 11 chars: 4 letters, 0, 6 alphanum
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const validateIfsc = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'IFSC code is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!IFSC_REGEX.test(value)) {
    return { valid: false, error: 'Invalid IFSC code (11 characters: 4 letters, 0, 6 alphanumeric).', value };
  }
  return { valid: true, value };
};

// 16. Bank Account Rules
// 9-18 digits
export const BANK_ACCOUNT_REGEX = /^[0-9]{9,18}$/;

export const validateBankAccount = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'Bank account number is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!BANK_ACCOUNT_REGEX.test(value)) {
    return { valid: false, error: 'Bank account must be between 9 and 18 digits.', value };
  }
  return { valid: true, value };
};

// 17. Date Rules
// Not before 2000-01-01, not more than 10 years ahead
export const validateDate = (raw?: string | Date, required = false): { valid: boolean; error?: string; value: string } => {
  if (!raw) {
    if (required) return { valid: false, error: 'Date is required.', value: '' };
    return { valid: true, value: '' };
  }
  const date = typeof raw === 'string' ? new Date(raw) : raw;
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date.', value: '' };
  }
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < 2000) {
    return { valid: false, error: 'Date cannot be before year 2000.', value: date.toISOString() };
  }
  if (year > currentYear + 10) {
    return { valid: false, error: `Date cannot be more than 10 years in the future (max ${currentYear + 10}).`, value: date.toISOString() };
  }
  return { valid: true, value: date.toISOString() };
};

// 18. URL Rules
// https:// only
export const URL_REGEX = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const validateHttpsUrl = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'URL is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!URL_REGEX.test(value)) {
    return { valid: false, error: 'URL must start with https:// and be a valid web address.', value };
  }
  return { valid: true, value };
};

// 19. Currency & Total Recalculation Engine
export interface OrderCalculationLine {
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CalculatedTotals {
  lineTotals: number[];
  taxableSubtotal: number;
  gstAmount: number;
  grandTotal: number;
}

export const roundCurrency = (amount: number): number => {
  return Math.round((Number(amount) || 0) * 100) / 100;
};

export const calculateLineTotal = (quantity: number, unitPrice: number, discount = 0): number => {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const disc = Number(discount) || 0;
  return Math.max(0, roundCurrency(qty * price - disc));
};

export const calculateDocumentTotals = (
  lines: OrderCalculationLine[],
  gstRatePercent = 18
): CalculatedTotals => {
  const lineTotals = lines.map((l) => calculateLineTotal(l.quantity, l.unitPrice, l.discount));
  const taxableSubtotal = roundCurrency(lineTotals.reduce((sum, lt) => sum + lt, 0));
  const rate = ALLOWED_GST_RATES.includes(gstRatePercent as GstRate) ? gstRatePercent : 18;
  const gstAmount = roundCurrency(taxableSubtotal * (rate / 100));
  const grandTotal = roundCurrency(taxableSubtotal + gstAmount);

  return {
    lineTotals,
    taxableSubtotal,
    gstAmount,
    grandTotal,
  };
};

export const formatIndianCurrency = (amount: number | string): string => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
