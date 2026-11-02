/* --- TEST SUITE: GSTIN VALIDATION PARITY (CJS) ---
 * Tests the shared validateGstin rule across all scenarios:
 * 1. Valid GSTIN
 * 2. Empty GSTIN (optional)
 * 3. 14 characters (wrong length)
 * 4. Wrong structure (e.g. letters instead of state code)
 * 5. Wrong checksum digit
 * ------------------------------------------- */

const { validateGstin, verifyGstinChecksum } = require('../packages/shared-validation/dist/index.js');

const testCases = [
  {
    name: '1. Valid Karnataka GSTIN with valid checksum',
    input: '29ABCDE1234F1ZW',
    expectedValid: true,
  },
  {
    name: '2. Empty GSTIN (optional)',
    input: '',
    expectedValid: true,
  },
  {
    name: '3. 14 characters (too short)',
    input: '29ABCDE1234F1Z',
    expectedValid: false,
    expectedErrorSnippet: '15 characters',
  },
  {
    name: '4. Wrong structure (e.g. letters where state code is expected)',
    input: 'XXABCDE1234F1Z5',
    expectedValid: false,
    expectedErrorSnippet: 'Invalid GSTIN format',
  },
  {
    name: '5. Wrong checksum digit (last char manipulated)',
    input: '29ABCDE1234F1Z9',
    expectedValid: false,
    expectedErrorSnippet: 'checksum',
  },
];

console.log('=== RUNNING GSTIN VALIDATION PARITY TESTS ===\n');
let passed = 0;

for (const tc of testCases) {
  const res = validateGstin(tc.input);
  const isValidMatches = res.valid === tc.expectedValid;
  let isErrorMatches = true;

  if (!tc.expectedValid && tc.expectedErrorSnippet) {
    isErrorMatches = (res.error || '').toLowerCase().includes(tc.expectedErrorSnippet.toLowerCase());
  }

  if (isValidMatches && isErrorMatches) {
    console.log(`PASS: ${tc.name}`);
    console.log(`      Result: valid=${res.valid}, error="${res.error || ''}"`);
    passed++;
  } else {
    console.error(`FAIL: ${tc.name}`);
    console.error(`      Expected valid=${tc.expectedValid}, got valid=${res.valid}`);
    console.error(`      Error: "${res.error}"`);
    process.exit(1);
  }
}

console.log(`\nALL ${passed} / ${testCases.length} GSTIN TESTS PASSED CLEANLY.`);
