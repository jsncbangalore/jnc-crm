/**
 * Tax & Banking Identity Validation Module
 * Single shared validation for GSTIN, PAN, and IFSC.
 * Conforms to Indian GST & Income Tax formatting and checksum rules.
 */

// 1. Valid GST State Codes: 01 to 38, 97 (Other Territory), 99 (Centre Jurisdiction)
export const VALID_GST_STATE_CODES = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '97', '99',
]);

// 2. Format RegExes
export const GSTIN_FORMAT_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const GSTIN_CHAR_SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 3. Cleaners for paste / typing
export const cleanPan = (val: string): string => {
  if (typeof val !== 'string') return '';
  return val.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10);
};

export const cleanGstin = (val: string): string => {
  if (typeof val !== 'string') return '';
  return val.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
};

export const cleanIfsc = (val: string): string => {
  if (typeof val !== 'string') return '';
  return val.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 11);
};

// 4. Mod-36 Luhn Checksum for GSTIN
export const verifyGstinChecksum = (gstin: string): boolean => {
  if (typeof gstin !== 'string' || gstin.length !== 15) return false;
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

export interface ValidationResult {
  valid: boolean;
  error?: string;
  value: string;
}

// 5. PAN Validation
export const validatePan = (raw?: string, required = false): ValidationResult => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'PAN is required.', value: '' };
    return { valid: true, value: '' };
  }
  if (!PAN_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Invalid PAN format. Enter 10 letters and digits, for example AAAAA0000A',
      value,
    };
  }
  return { valid: true, value };
};

// 6. GSTIN Validation (Format + State Code + Embedded PAN + Mod-36 Checksum)
export const validateGstin = (
  raw?: string,
  required = false,
  expectedPan?: string,
): ValidationResult => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'GSTIN is required.', value: '' };
    return { valid: true, value: '' };
  }

  if (!GSTIN_FORMAT_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Invalid GSTIN format. Enter 15 letters and digits, for example 29AAAAA0000A1ZY',
      value,
    };
  }

  const stateCode = value.slice(0, 2);
  if (!VALID_GST_STATE_CODES.has(stateCode)) {
    return {
      valid: false,
      error: 'Invalid GSTIN state code. Must start with a valid 2-digit Indian state code (01-38, 97, 99).',
      value,
    };
  }

  if (expectedPan && expectedPan.trim()) {
    const cleanedExpectedPan = cleanPan(expectedPan);
    if (cleanedExpectedPan.length === 10) {
      const embeddedPan = value.slice(2, 12);
      if (embeddedPan !== cleanedExpectedPan) {
        return {
          valid: false,
          error: 'GSTIN does not match the provided PAN number.',
          value,
        };
      }
    }
  }

  if (!verifyGstinChecksum(value)) {
    return {
      valid: false,
      error: 'Invalid GSTIN checksum digit.',
      value,
    };
  }

  return { valid: true, value };
};

// 7. IFSC Validation
export const validateIfsc = (raw?: string, required = false): ValidationResult => {
  const value = (raw || '').trim().toUpperCase();
  if (!value) {
    if (required) return { valid: false, error: 'IFSC code is required.', value: '' };
    return { valid: true, value: '' };
  }

  if (!IFSC_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Invalid IFSC code. Enter 11 letters and digits, for example HDFC0001234',
      value,
    };
  }

  return { valid: true, value };
};
