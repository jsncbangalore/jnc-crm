import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  validatePersonOrCompanyName,
  validateNameField,
  filterNameInput,
  NAME_FIELD_REGEX,
  validatePhone,
  isIndianLandline,
  normalizeToE164,
  comparePhoneNumbers,
  checkPhonePaste,
  validateEmail,
  validateProductName,
  validateSku,
  validateQuantity,
  validateUnitRate,
  validateGstRate,
  validateAddress,
  validateNotes,
  validatePostalPin,
  validateGstin,
  validatePan,
  validateIfsc,
  validateBankAccount,
  validateDate,
  calculateDocumentTotals,
  stripHtml,
  sanitizeText,
  validateMeaningfulNarration,
} from '../../packages/shared-validation/src/index';

describe('1. NameField & Multilingual Combining Marks (Item 2)', () => {
  it('accepts Kannada names with combining marks (vowels/halant)', () => {
    // Raghavendra Hegde in Kannada
    const kannadaName = 'ರಾಘವೇಂದ್ರ ಹೆಗಡೆ';
    expect(NAME_FIELD_REGEX.test(kannadaName)).toBe(true);
    const res = validateNameField(kannadaName, true, 60);
    expect(res.valid).toBe(true);
    expect(res.value).toBe(kannadaName);
  });

  it('accepts Hindi names with combining marks (matras/conjuncts)', () => {
    // Rahul Sharma in Hindi Devanagari
    const hindiName = 'राहुल शर्मा';
    expect(NAME_FIELD_REGEX.test(hindiName)).toBe(true);
    const res = validateNameField(hindiName, true, 60);
    expect(res.valid).toBe(true);
    expect(res.value).toBe(hindiName);
  });

  it('accepts Tamil names with combining marks (uyirmei)', () => {
    // Muthuvel Karunanidhi in Tamil
    const tamilName = 'முத்துவேல் கருணாநிதி';
    expect(NAME_FIELD_REGEX.test(tamilName)).toBe(true);
    const res = validateNameField(tamilName, true, 60);
    expect(res.valid).toBe(true);
    expect(res.value).toBe(tamilName);
  });

  it('accepts English names with dots, hyphens, spaces, and apostrophes', () => {
    const names = [
      'Dr. John O\'Connor',
      'Mary-Jane Watson',
      'C. V. Raman',
      'Jean-Luc Picard',
    ];
    for (const name of names) {
      expect(NAME_FIELD_REGEX.test(name)).toBe(true);
      expect(validateNameField(name).valid).toBe(true);
    }
  });

  it('rejects digits and disallowed symbols in NameField with "Use letters only"', () => {
    const invalidNames = [
      'Rahul123',
      'John Doe @ Acme',
      'Test User #1',
      '12345',
      'User (Manager)',
      'Sales & Marketing',
    ];
    for (const name of invalidNames) {
      const res = validateNameField(name);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Use letters only.');
    }
  });

  it('enforces 60-character maximum on NameField', () => {
    const longName = 'A'.repeat(61);
    const res = validateNameField(longName);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('cannot exceed 60 characters');
  });

  it('filterNameInput strips digits and disallowed punctuation while preserving combining marks', () => {
    expect(filterNameInput('Rahul123!')).toBe('Rahul');
    expect(filterNameInput('ರಾಘವೇಂದ್ರ123')).toBe('ರಾಘವೇಂದ್ರ');
    expect(filterNameInput('राहुल@शर्मा')).toBe('राहुलशर्मा');
    expect(filterNameInput('Dr. O\'Connor-Smith')).toBe('Dr. O\'Connor-Smith');
  });

  it('preserves Company name rules (100 chars, digits, & ( ) , . - / allowed)', () => {
    // Company names should NOT use NameField!
    const companyNames = [
      'Acme 360 Solutions Pvt. Ltd.',
      'Tata & Sons (India) Ltd. / Corp.',
      'L&T Construction (South) - Div. 2',
      '3M India Limited',
    ];
    for (const cName of companyNames) {
      const res = validatePersonOrCompanyName(cName);
      expect(res.valid).toBe(true);
      expect(res.value.length).toBeLessThanOrEqual(100);
    }

    // Company names exceeding 100 chars must be rejected
    const tooLongCompany = 'Acme ' + 'A'.repeat(97);
    expect(validatePersonOrCompanyName(tooLongCompany).valid).toBe(false);
  });
});

describe('2. PhoneField, Landlines, E.164 Normalization & Matching (Item 3)', () => {
  const sampleMobile = '9876543210';

  it('accepts valid 10-digit Indian mobile starting with 6, 7, 8, 9', () => {
    const validMobiles = ['9876543210', '8876543210', '7876543210', '6876543210'];
    for (const mob of validMobiles) {
      const res = validatePhone(mob, 'mobile');
      expect(res.valid).toBe(true);
      expect(res.isLandline).toBe(false);
    }
  });

  it('rejects Indian mobile starting with 1-5', () => {
    const invalidMobiles = ['5876543210', '4876543210', '3876543210', '2876543210', '1876543210'];
    for (const mob of invalidMobiles) {
      const res = validatePhone(mob, 'mobile');
      expect(res.valid).toBe(false);
    }
  });

  it('accepts Indian landline numbers (STD code + subscriber number)', () => {
    // Bengaluru STD 080 + 8 digits, Delhi STD 011 + 8 digits, Mumbai STD 022 + 8 digits
    const landlines = [
      '080-23456789',
      '011 23456789',
      '02223456789',
      '044-23456789',
    ];
    for (const landline of landlines) {
      const res = validatePhone(landline, 'landline');
      expect(res.valid).toBe(true);
      expect(res.isLandline).toBe(true);
      expect(isIndianLandline(landline)).toBe(true);
    }
  });

  it('shows error on paste of too-long numbers without silent truncation', () => {
    const tooLong = '9876543210123';
    const pasteResult = checkPhonePaste(tooLong);
    expect(pasteResult.valid).toBe(false);
    expect(pasteResult.error).toContain('too many digits');
    // Ensure digits are preserved for caller inspection, not silently truncated
    expect(pasteResult.digits).toBe(tooLong);
  });

  it('normalizes local numbers to strict E.164 format', () => {
    expect(normalizeToE164('9876543210')).toBe('+919876543210');
    expect(normalizeToE164('09876543210')).toBe('+919876543210');
    expect(normalizeToE164('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeToE164('+1 415 555 2671')).toBe('+14155552671');
  });

  it('matches old 10-digit records against newly normalized E.164 numbers', () => {
    const oldTenDigit = '9876543210';
    const e164 = '+919876543210';
    const spaced = '+91 98765 43210';
    const leadingZero = '09876543210';

    expect(comparePhoneNumbers(oldTenDigit, e164)).toBe(true);
    expect(comparePhoneNumbers(oldTenDigit, spaced)).toBe(true);
    expect(comparePhoneNumbers(oldTenDigit, leadingZero)).toBe(true);
    expect(comparePhoneNumbers(e164, spaced)).toBe(true);
    expect(comparePhoneNumbers(oldTenDigit, '9123456789')).toBe(false);
  });
});

describe('3. India State and City Data Completeness (Item 8)', () => {
  const filePath = path.resolve(__dirname, '../../apps/web/src/data/indiaStatesCities.json');
  const rawData = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(rawData);

  const official28States = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
  ];

  const official8UnionTerritories = [
    'Andaman and Nicobar Islands',
    'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi',
    'Jammu and Kashmir',
    'Ladakh',
    'Lakshadweep',
    'Puducherry',
  ];

  it('has file size under 10 KB (approx 3.55 KB)', () => {
    const stats = fs.statSync(filePath);
    expect(stats.size).toBeLessThan(10 * 1024);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it('contains all 28 Indian States', () => {
    for (const state of official28States) {
      expect(data).toHaveProperty(state);
      expect(Array.isArray(data[state])).toBe(true);
      expect(data[state].length).toBeGreaterThan(0);
    }
  });

  it('contains all 8 Indian Union Territories', () => {
    for (const ut of official8UnionTerritories) {
      expect(data).toHaveProperty(ut);
      expect(Array.isArray(data[ut])).toBe(true);
      expect(data[ut].length).toBeGreaterThan(0);
    }
  });

  it('has exactly 36 official states/UTs plus "Other State" fallback (total 37)', () => {
    const keys = Object.keys(data);
    expect(keys.length).toBe(37);
    expect(keys).toContain('Other State');
    const officialCount = official28States.length + official8UnionTerritories.length;
    expect(officialCount).toBe(36);
  });
});

describe('4. Additional Helper Functions (Migrated from ad-hoc scripts)', () => {
  it('validates email correctly', () => {
    expect(validateEmail('user@example.com').valid).toBe(true);
    expect(validateEmail('test.lead+ops@example.com').valid).toBe(true);
    expect(validateEmail('').valid).toBe(true); // Optional by default
    expect(validateEmail('', true).valid).toBe(false); // Required
    expect(validateEmail('invalid-email').valid).toBe(false);
  });

  it('validates quantities (> 0 and integer unless decimals allowed)', () => {
    expect(validateQuantity(1).valid).toBe(true);
    expect(validateQuantity(100.5, true).valid).toBe(true);
    expect(validateQuantity(100.5).valid).toBe(false); // decimals disallowed by default
    expect(validateQuantity(0).valid).toBe(false);
    expect(validateQuantity(-5).valid).toBe(false);
    expect(validateQuantity('abc').valid).toBe(false);
  });

  it('validates unit rates (> 0, rejecting 0 and negatives)', () => {
    expect(validateUnitRate(0).valid).toBe(false); // 0 is invalid rate
    expect(validateUnitRate(1500).valid).toBe(true);
    expect(validateUnitRate(-10).valid).toBe(false);
  });

  it('validates standard Indian GST rates', () => {
    const validRates = [0, 5, 12, 18, 28];
    for (const r of validRates) {
      expect(validateGstRate(r).valid).toBe(true);
    }
    expect(validateGstRate(7).valid).toBe(false);
    expect(validateGstRate(-1).valid).toBe(false);
  });

  it('validates GSTIN, PAN, and IFSC', () => {
    // Valid GSTIN format with valid checksum: 29AAAAA0000A1ZY
    expect(validateGstin('29AAAAA0000A1ZY').valid).toBe(true);
    expect(validateGstin('29AAAAA0000A1Z9').valid).toBe(false);
    expect(validateGstin('INVALIDGST').valid).toBe(false);

    // Valid PAN: ABCDE1234F
    expect(validatePan('ABCDE1234F').valid).toBe(true);
    expect(validatePan('INVALIDPAN').valid).toBe(false);

    // Valid IFSC: SBIN0001234
    expect(validateIfsc('SBIN0001234').valid).toBe(true);
    expect(validateIfsc('1234HDFC').valid).toBe(false);
  });

  it('computes document totals with line-item GST and discounts', () => {
    const items = [
      { quantity: 2, unitPrice: 500 }, // 1000
      { quantity: 3, unitPrice: 200, discount: 50 }, // 550
    ];
    const totals = calculateDocumentTotals(items, 18);
    expect(totals.taxableSubtotal).toBe(1550);
    expect(totals.gstAmount).toBe(279);
    expect(totals.grandTotal).toBe(1829);
  });

  it('validates meaningful narrations and rejects gibberish or repeated characters', () => {
    expect(validateMeaningfulNarration('Advance payment received via NEFT').valid).toBe(true);
    expect(validateMeaningfulNarration('aaaaa').valid).toBe(false);
    expect(validateMeaningfulNarration('asdfghjkl').valid).toBe(false);
  });
});
