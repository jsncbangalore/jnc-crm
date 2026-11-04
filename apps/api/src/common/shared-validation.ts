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
export const NAME_REGEX = /^[\p{L}\p{M}\p{N}\s.,&\-'()\/]+$/u;
export const HAS_LETTER_REGEX = /[\p{L}\p{M}]/u;
export const TEXT_ONLY_NAME_REGEX = /^[\p{L}\p{M}\s.,&\-'()\/]+$/u;

// Filter text-only inputs (strips digits and disallowed symbols)
export const filterTextOnly = (val: string): string => {
  if (typeof val !== 'string') return '';
  return val.replace(/[0-9]/g, '').replace(/[^\p{L}\p{M}\s.,&'\-()\/]/gu, '');
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

// NameField validation: letters AND combining marks of all scripts (\p{L}\p{M}), spaces, dot, hyphen, apostrophe; max 60 characters with counter; trims; plain message "Use letters only".
export const NAME_FIELD_REGEX = /^[\p{L}\p{M}\s.\-']+$/u;

export const filterNameInput = (val: string, max = 60): string => {
  if (typeof val !== 'string') return '';
  const filtered = val.replace(/[^\p{L}\p{M}\s.\-']/gu, '');
  return max > 0 ? filtered.slice(0, max) : filtered;
};

export const validateNameField = (
  raw?: string,
  required = true,
  max = 60
): { valid: boolean; error?: string; value: string } => {
  if (typeof raw !== 'string') {
    return { valid: !required, error: required ? 'Name is required.' : undefined, value: '' };
  }
  const value = raw.trim();
  if (!value) {
    return { valid: !required, error: required ? 'Name is required.' : undefined, value: '' };
  }
  if (value.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters.', value };
  }
  if (value.length > max) {
    return { valid: false, error: `Name cannot exceed ${max} characters.`, value };
  }
  if (!NAME_FIELD_REGEX.test(value)) {
    return { valid: false, error: 'Use letters only.', value };
  }
  return { valid: true, value };
};

// Narration & Note Validation: Require meaningful text (5+ chars, non-gibberish)
export const validateMeaningfulNarration = (
  raw: string,
  fieldName = 'Narration'
): { valid: boolean; error?: string; value: string } => {
  if (typeof raw !== 'string') {
    return { valid: false, error: `${fieldName} is required.`, value: '' };
  }
  const value = sanitizeText(raw);
  if (!value || value.length < 5) {
    return { valid: false, error: `${fieldName} must be at least 5 characters.`, value };
  }
  if (value.length > 500) {
    return { valid: false, error: `${fieldName} cannot exceed 500 characters.`, value };
  }

  // Reject repeated characters like "aaaaa", "11111", "-----"
  if (/^(.)\1+$/.test(value) || new Set(value.toLowerCase().replace(/\s/g, '')).size < 3) {
    return { valid: false, error: `${fieldName} contains repeated characters. Please enter a meaningful note.`, value };
  }

  // Check for vowels or common financial abbreviations (chq, neft, rtgs, imps, upi, inv, bill, etc.)
  const hasVowels = /[aeiouAEIOU]/i.test(value);
  const financialTerms = /\b(chq|neft|rtgs|imps|upi|dd|inv|cr|dr|adj|tax|tds|gst|po|so|bill|rcpt|rev|ref)\b/i;

  // Words with >= 5 consonants in a row without vowels, or keyboard smashing like "tyhhsdh", "asdfgh"
  const words = value.split(/\s+/).filter(Boolean);
  const hasGibberishWord = words.some((w) => {
    const lettersOnly = w.replace(/[^a-zA-Z]/g, '');
    if (lettersOnly.length >= 5 && !/[aeiou]/i.test(lettersOnly) && !financialTerms.test(w)) {
      return true; // e.g. "tyhhsdh"
    }
    if (/^[asdfghjkl]+$/i.test(lettersOnly) && lettersOnly.length >= 6) return true;
    if (/^[qwertyuiop]+$/i.test(lettersOnly) && lettersOnly.length >= 6) return true;
    if (/^[zxcvbnm]+$/i.test(lettersOnly) && lettersOnly.length >= 6) return true;
    return false;
  });

  if (hasGibberishWord || (!hasVowels && !financialTerms.test(value))) {
    return {
      valid: false,
      error: `${fieldName} must contain meaningful words, not random letters or gibberish.`,
      value,
    };
  }

  return { valid: true, value };
};

// 3. Mobile & Landline Phone Rules
// Clean +91, leading 0, spaces, dashes.
// Indian mobile: 10 digits starting 6-9.
// Indian landline: STD code (2-4 digits) + subscriber number (6-8 digits) = 10 digits total without leading 0.
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

// Check if a normalized 10-digit number is an Indian landline (starts with 0 STD or 10 digits with STD 1-8, or 8 digits local)
export const isIndianLandline = (raw: string): boolean => {
  const cleaned = cleanPhone(raw);
  if (!cleaned) return false;
  if (cleaned.startsWith('0') && cleaned.length >= 9 && cleaned.length <= 11) {
    return true;
  }
  const norm = normalizePhoneNumber(raw);
  return /^[1-8]\d{7,9}$/.test(norm) && (norm.length === 10 || norm.length === 8);
};

export const normalizeToE164 = (phone?: string, defaultCountry = '+91'): string => {
  if (!phone) return '';
  const cleaned = cleanPhone(phone);
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.slice(1).replace(/\D/g, '');
    if (cleaned.startsWith('+91')) {
      const national = cleaned.slice(3).replace(/\D/g, '');
      return `+91${national.slice(-10)}`;
    }
    return `+${digitsOnly}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountry}${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `${defaultCountry}${digits}`;
  }
  if (digits.length > 10 && (defaultCountry === '+91' || defaultCountry === '91')) {
    return `${defaultCountry.startsWith('+') ? defaultCountry : `+${defaultCountry}`}${digits.slice(-10)}`;
  }
  const prefix = defaultCountry.startsWith('+') ? defaultCountry : `+${defaultCountry}`;
  return `${prefix}${digits}`;
};

export const comparePhoneNumbers = (a?: string, b?: string): boolean => {
  if (!a || !b) return false;
  const e164A = normalizeToE164(a);
  const e164B = normalizeToE164(b);
  if (e164A && e164B && e164A === e164B) return true;

  // Compare trailing 10 digits for Indian numbers
  const digA = a.replace(/\D/g, '').slice(-10);
  const digB = b.replace(/\D/g, '').slice(-10);
  return digA.length === 10 && digA === digB;
};

export const validatePhone = (
  raw: string,
  type: 'mobile' | 'landline' | 'any' = 'any'
): { valid: boolean; error?: string; value: string; isLandline?: boolean } => {
  const cleaned = cleanPhone(raw);
  if (!cleaned) {
    return { valid: false, error: 'Phone number is required.', value: '' };
  }

  const indianNormalized = normalizePhoneNumber(cleaned);

  // If explicitly requested landline
  if (type === 'landline') {
    if (/^[1-8]\d{7,9}$/.test(indianNormalized) && (indianNormalized.length === 10 || indianNormalized.length === 8)) {
      return { valid: true, value: indianNormalized, isLandline: true };
    }
    return { valid: false, error: 'Enter a valid landline number (STD code + number).', value: indianNormalized };
  }

  // If explicitly requested mobile
  if (type === 'mobile') {
    if (/^[6-9]\d{9}$/.test(indianNormalized)) {
      return { valid: true, value: indianNormalized, isLandline: false };
    }
    return { valid: false, error: 'Enter a 10-digit mobile number.', value: indianNormalized };
  }

  // If type is 'any':
  // If Indian mobile number (10 digits starting 6-9) and did NOT explicitly start with 0 STD code
  if (/^[6-9]\d{9}$/.test(indianNormalized) && !cleaned.startsWith('0')) {
    return { valid: true, value: indianNormalized, isLandline: false };
  }

  // If Indian landline number (starts with 0, or 8 digits, or 10 digits starting with 1-8)
  if (cleaned.startsWith('0') || isIndianLandline(cleaned)) {
    if (/^[1-8]\d{7,9}$/.test(indianNormalized) && (indianNormalized.length === 10 || indianNormalized.length === 8)) {
      return { valid: true, value: indianNormalized, isLandline: true };
    }
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

  if (/^[6-9]\d{9}$/.test(indianNormalized)) {
    return { valid: true, value: indianNormalized, isLandline: false };
  }

  return {
    valid: false,
    error: 'Enter a 10-digit mobile number or landline with STD code.',
    value: indianNormalized,
  };
};

export const checkPhonePaste = (
  val: string,
  countryCode = '+91'
): { valid: boolean; digits: string; error?: string } => {
  if (!val) return { valid: true, digits: '' };
  let cleaned = val.replace(/[\s\-\(\)\.]/g, '').trim();
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }
  const digits = cleaned.replace(/\D/g, '');
  if (countryCode === '+91' || countryCode === '91') {
    if (digits.length > 10) {
      return {
        valid: false,
        digits,
        error: 'Pasted number has too many digits. Please enter a 10-digit number.',
      };
    }
  } else if (digits.length > 15) {
    return {
      valid: false,
      digits,
      error: 'Pasted number has too many digits for selected country.',
    };
  }
  return { valid: true, digits };
};

export const cleanPhonePaste = (val: string, countryCode = '+91'): string => {
  if (!val) return '';
  let cleaned = val.replace(/[\s\-\(\)\.]/g, '').trim();
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }
  return cleaned.replace(/\D/g, '');
};

export const formatToE164 = (nationalNumber: string, countryCode = '+91'): string => {
  const cleanDigits = nationalNumber.replace(/\D/g, '');
  if (!cleanDigits) return '';
  const code = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  return `${code}${cleanDigits}`;
};

export const validatePhoneField = (
  nationalNumber: string,
  countryCode = '+91',
  phoneType: 'mobile' | 'landline' = 'mobile'
): { valid: boolean; error?: string; value: string; e164: string } => {
  const cleanDigits = nationalNumber.replace(/\D/g, '');
  if (!cleanDigits) {
    return {
      valid: false,
      error: phoneType === 'landline' ? 'Enter a valid landline number (STD code + number).' : 'Enter a 10-digit mobile number.',
      value: '',
      e164: '',
    };
  }

  if (countryCode === '+91' || countryCode === '91') {
    if (phoneType === 'landline') {
      if (cleanDigits.length < 8 || cleanDigits.length > 10 || !/^[1-5]/.test(cleanDigits)) {
        return {
          valid: false,
          error: 'Enter a valid landline number (STD code + number).',
          value: cleanDigits,
          e164: `+91${cleanDigits}`,
        };
      }
      return {
        valid: true,
        value: cleanDigits,
        e164: `+91${cleanDigits}`,
      };
    }

    if (cleanDigits.length !== 10 || !/^[6-9]/.test(cleanDigits)) {
      return {
        valid: false,
        error: 'Enter a 10-digit mobile number.',
        value: cleanDigits,
        e164: `+91${cleanDigits}`,
      };
    }
    return {
      valid: true,
      value: cleanDigits,
      e164: `+91${cleanDigits}`,
    };
  }

  if (cleanDigits.length < 8 || cleanDigits.length > 15) {
    return {
      valid: false,
      error: 'Enter a valid phone number for selected country.',
      value: cleanDigits,
      e164: `${countryCode}${cleanDigits}`,
    };
  }
  return {
    valid: true,
    value: cleanDigits,
    e164: `${countryCode}${cleanDigits}`,
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
// https:// only, max 500 characters
export const URL_REGEX = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const validateHttpsUrl = (raw?: string, required = false): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'URL is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (value.length > 500) {
    return { valid: false, error: 'URL cannot exceed 500 characters.', value };
  }
  if (!URL_REGEX.test(value)) {
    return { valid: false, error: 'URL must start with https:// and be a valid web address.', value };
  }
  return { valid: true, value };
};

/**
 * Validates binary magic signatures for image buffers.
 * Supported: PNG, JPEG, WebP. Strictly refuses SVG, GIF, BMP, plain text, etc.
 */
export function hasValidImageMagicSignature(buf: Buffer | Uint8Array): boolean {
  if (!buf || buf.length < 8) return false;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (isPng) return true;

  // JPEG signature: FF D8 FF
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (isJpeg) return true;

  // WebP signature: 'RIFF' (offset 0..3) ... 'WEBP' (offset 8..11)
  const isWebp =
    buf.length >= 12 &&
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50; // P
  if (isWebp) return true;

  return false;
}

// 18B. Logo Field Validation (Document logo & optional Portal logo & stamps)
// Rules:
// - Never use the 500-char rule on data URLs. Max length on data URLs: 3,000,000 characters.
// - Allowed MIME prefix: data:image/png, data:image/jpeg, data:image/jpg, data:image/webp only.
// - Decoded size: at most 2 MB (2 * 1024 * 1024 = 2,097,152 bytes).
// - Binary magic byte signature verified (PNG, JPEG, WebP). Wrong file type renamed to .png is refused.
// - No SVG (disallowed to prevent XSS).
// - Web/relative URLs keep max 500 characters and must use HTTPS (or relative /).
// - Friendly messages:
//     'The logo is too large. Maximum 2 MB.'
//     'The logo must be a PNG, JPEG or WebP image.'
export const validateLogoField = (
  raw?: string | null,
  required = false
): { valid: boolean; error?: string; value: string | null } => {
  if (raw === null || raw === undefined || raw === '') {
    if (required) return { valid: false, error: 'Logo is required.', value: null };
    return { valid: true, value: null };
  }

  const value = String(raw).trim();
  if (!value) {
    if (required) return { valid: false, error: 'Logo is required.', value: null };
    return { valid: true, value: null };
  }

  // 1. Base64 Data URL
  if (value.startsWith('data:')) {
    // Strictly forbid SVG
    if (/data:image\/svg/i.test(value) || /<svg/i.test(value)) {
      return {
        valid: false,
        error: 'The logo must be a PNG, JPEG or WebP image.',
        value,
      };
    }

    const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/is);
    if (!match) {
      return {
        valid: false,
        error: 'The logo must be a PNG, JPEG or WebP image.',
        value,
      };
    }

    if (value.length > 3_000_000) {
      return {
        valid: false,
        error: 'The logo is too large. Maximum 2 MB.',
        value,
      };
    }

    const base64Data = match[2];
    let buf: Buffer | null = null;
    let byteLen = 0;

    try {
      if (typeof Buffer !== 'undefined') {
        buf = Buffer.from(base64Data, 'base64');
        byteLen = buf.length;
      } else {
        const cleanBase64 = base64Data.replace(/[\r\n\s=]/g, '');
        byteLen = Math.floor((cleanBase64.length * 3) / 4);
      }

      const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
      if (byteLen > MAX_BYTES) {
        return {
          valid: false,
          error: 'The logo is too large. Maximum 2 MB.',
          value,
        };
      }

      // Verify binary magic signature
      if (buf) {
        if (!hasValidImageMagicSignature(buf)) {
          return {
            valid: false,
            error: 'The logo must be a PNG, JPEG or WebP image.',
            value,
          };
        }
      }
    } catch {
      return {
        valid: false,
        error: 'The logo must be a PNG, JPEG or WebP image.',
        value,
      };
    }

    return { valid: true, value };
  }

  // 2. HTTP/HTTPS or Relative internal URL
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    if (value.length > 500) {
      return {
        valid: false,
        error: 'The logo is too large. Maximum 2 MB.',
        value,
      };
    }
    if (
      value.startsWith('http://') &&
      !value.startsWith('http://localhost') &&
      !value.startsWith('http://127.0.0.1')
    ) {
      return {
        valid: false,
        error: 'External logo URL must use HTTPS.',
        value,
      };
    }
    return { valid: true, value };
  }

  return {
    valid: false,
    error: 'The logo must be a PNG, JPEG or WebP image.',
    value,
  };
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

// 20. UPI ID Rules
export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;

export const validateUpiId = (
  raw?: string | null,
  required = false
): { valid: boolean; error?: string; value: string } => {
  const value = (raw || '').trim();
  if (!value) {
    if (required) return { valid: false, error: 'UPI ID is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!UPI_ID_REGEX.test(value)) {
    return { valid: false, error: 'Invalid UPI ID format (e.g. name@bank or merchant@upi).', value };
  }
  return { valid: true, value };
};

// 21. Payment Reference Validation Rules by Mode
export const UPI_REF_REGEX = /^\d{12}$/;
export const CHEQUE_REF_REGEX = /^\d{6}$/;
export const NEFT_RTGS_IMPS_REF_REGEX = /^[a-zA-Z0-9/_\-\.\:\s]{4,50}$/;

export const getPaymentReferenceHint = (method: string): string => {
  const m = (method || '').toUpperCase();
  if (m === 'CASH') {
    return 'Cash payments do not require a reference number.';
  }
  if (m === 'CHEQUE') {
    return 'Cheque number must be exactly 6 digits.';
  }
  if (m === 'UPI') {
    return 'UPI reference must be a 12-digit transaction number (UTR).';
  }
  return 'NEFT/RTGS/IMPS reference must be 4 to 50 characters (letters, numbers, / or -).';
};

export const validatePaymentReference = (
  method: string,
  rawRef?: string | null
): { valid: boolean; error?: string; hint: string; value: string } => {
  const m = (method || '').toUpperCase();
  const value = (rawRef || '').trim();
  const hint = getPaymentReferenceHint(method);

  if (m === 'CASH') {
    return { valid: true, hint, value: '' };
  }

  if (!value) {
    return { valid: false, error: 'Reference / UTR number is required.', hint, value: '' };
  }

  if (m === 'CHEQUE') {
    if (!CHEQUE_REF_REGEX.test(value)) {
      return { valid: false, error: 'Cheque number must be exactly 6 digits.', hint, value };
    }
    return { valid: true, hint, value };
  }

  if (m === 'UPI') {
    if (!UPI_REF_REGEX.test(value)) {
      return { valid: false, error: 'UPI reference must be a 12-digit transaction number (UTR).', hint, value };
    }
    return { valid: true, hint, value };
  }

  if (!NEFT_RTGS_IMPS_REF_REGEX.test(value) || !/[a-zA-Z0-9]/.test(value)) {
    return { valid: false, error: 'NEFT/RTGS/IMPS reference must be 4 to 50 characters (letters, numbers, / or -).', hint, value };
  }

  return { valid: true, hint, value };
};

// 22. Standard Display Date Formatter ('24 Aug 2026')
const MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDisplayDate = (raw?: string | Date | null): string => {
  if (!raw) return '-';
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = MONTH_ABBRS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// 23. Shared Friendly Error Layer
export const formatFriendlyErrorMessage = (error: any, fallback = 'An unexpected error occurred.'): string => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const code = error?.code || '';
  const msg = error?.message || '';
  if (
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    !error.response ||
    /Network Error|Failed to fetch|NetworkError/i.test(msg)
  ) {
    return 'Cannot reach the server. Your payment was not saved.';
  }

  const data = error.response?.data;
  if (data) {
    if (Array.isArray(data.message)) {
      return data.message.join('. ');
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
    if (Array.isArray(data.errors)) {
      return data.errors.map((e: any) => e.message || String(e)).join('. ');
    }
    if (typeof data.error === 'string') {
      return data.error;
    }
  }

  if (typeof msg === 'string' && msg) {
    return msg;
  }

  return 'Failed to save changes. Please try again.';
};

