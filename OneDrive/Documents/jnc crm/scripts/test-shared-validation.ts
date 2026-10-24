/* --- SHARED VALIDATION TEST SUITE ---
 * Tests every single rule with valid and invalid cases as specified.
 * ----------------------------------------------------------------- */

import {
  validatePersonOrCompanyName,
  validatePhone,
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
  validateHttpsUrl,
  calculateDocumentTotals,
  stripHtml,
  sanitizeText,
  validateTextOnlyName,
  filterTextOnly,
} from '../packages/shared-validation/src/index';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string, details?: any) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${desc}`);
  } else {
    failed++;
    console.error(`[FAIL] ${desc}`, details ? details : '');
  }
}

console.log('========================================================================');
console.log('CRM SHARED VALIDATION & DATA INTEGRITY TEST SUITE');
console.log('========================================================================\n');

// 1. Person / Company Name
console.log('--- 1. Person / Company Name ---');
assert(validatePersonOrCompanyName('Acme Corp Pvt Ltd').valid, 'Valid company name with letters & space');
assert(validatePersonOrCompanyName('Dr. John O\'Connor & Co. (UK) / Ltd.').valid, 'Valid name with ., & - \' () /');
assert(validatePersonOrCompanyName('JNC 360 Solutions').valid, 'Valid name with digits and letters');
// Invalid:
assert(!validatePersonOrCompanyName('').valid, 'Empty name rejected');
assert(!validatePersonOrCompanyName('A').valid, 'Single letter name rejected (< 2 chars)');
assert(!validatePersonOrCompanyName('   ').valid, 'Whitespace only rejected');
assert(!validatePersonOrCompanyName('1234567').valid, 'Digits only rejected (must contain at least one letter)');
assert(
  !validatePersonOrCompanyName('ABC mskdsk@3224****#$3').valid,
  'Spec invalid case "ABC mskdsk@3224****#$3" rejected (disallowed symbols @, *, #, $)',
);
assert(
  !validatePersonOrCompanyName('A'.repeat(101)).valid,
  'Name exceeding 100 characters rejected',
);
// Text-Only validations
assert(validateTextOnlyName('Rajesh Kumar').valid, 'Valid text-only customer name accepted');
assert(validateTextOnlyName('Acme Solutions Pvt Ltd').valid, 'Valid text-only company name accepted');
assert(!validateTextOnlyName('Rajesh Kumar52254254').valid, 'Customer name with numbers rejected by text-only validator');
assert(!validateTextOnlyName('12345Corp').valid, 'Company name with numbers rejected by text-only validator');
assert(filterTextOnly('Rajesh Kumar52254254') === 'Rajesh Kumar', 'filterTextOnly strips numbers from name');
assert(filterTextOnly(['12345', 'SampleCorp'].join('')) === 'SampleCorp', 'filterTextOnly strips numbers from company name');

// 2. Mobile Phone
console.log('\n--- 2. Mobile Phone ---');
const dummyValidMobile = ['98765', '43210'].join('');
assert(validatePhone(dummyValidMobile).valid && validatePhone(dummyValidMobile).value === dummyValidMobile, 'Standard 10-digit Indian mobile starting with 9');
assert(validatePhone(`+91 ${dummyValidMobile.slice(0, 5)} ${dummyValidMobile.slice(5)}`).valid && validatePhone(`+91 ${dummyValidMobile.slice(0, 5)} ${dummyValidMobile.slice(5)}`).value === dummyValidMobile, 'Clean +91 and spaces to 10-digit');
assert(validatePhone(`0${dummyValidMobile}`).valid && validatePhone(`0${dummyValidMobile}`).value === dummyValidMobile, 'Clean leading 0 to 10-digit');
assert(validatePhone('+1 415 555 2671').valid, 'Valid international phone with country code (+1)');
assert(validatePhone('+44 20 7946 0958').valid, 'Valid UK phone with country code (+44)');
// Invalid:
assert(!validatePhone('').valid, 'Empty phone rejected');
assert(!validatePhone(['12345', '67890'].join('')).valid, 'Indian phone starting with 1 rejected (must start 6-9)');
assert(!validatePhone(['54879', '65555'].join('')).valid, 'Indian phone starting with 5 rejected');
assert(!validatePhone(['98765', '4321'].join('')).valid, '9-digit phone rejected (under length)');
assert(
  !validatePhone(['54879', '000000000000', '44899'].join('')).valid,
  'Spec invalid case 23 digits rejected',
);
assert(
  !validatePhone('+12345678901234567890').valid,
  'International phone exceeding 15 digits rejected',
);

// 3. Email Address
console.log('\n--- 3. Email Address ---');
assert(validateEmail('client@example.com').valid, 'Standard email accepted');
assert(validateEmail('test.lead+ops@example.com').valid, 'Email with tags and multi-part domain accepted');
assert(validateEmail('').valid, 'Optional empty email accepted');
assert(!validateEmail('', true).valid, 'Required empty email rejected');
// Invalid:
assert(!validateEmail('invalid-email').valid, 'Email missing @ and domain rejected');
assert(!validateEmail('test@nodot').valid, 'Email missing dot in domain rejected');
assert(!validateEmail('test@.com').valid, 'Email with leading dot in domain rejected');
assert(!validateEmail('@domain.com').valid, 'Email missing username rejected');
assert(!validateEmail('a'.repeat(250) + '@example.com').valid, 'Email exceeding 254 chars rejected');

// 4. Product Name
console.log('\n--- 4. Product Name ---');
assert(validateProductName('Industrial Servo Motor 5HP').valid, 'Standard product name accepted');
assert(validateProductName('PVC Pipe 1.5" OD').valid, 'Product name with units accepted');
assert(!validateProductName('A').valid, '1-character product name rejected');
assert(!validateProductName('Product\x00\x08Name').valid, 'Product name with control characters rejected');
assert(
  !validateProductName('dsdsdsvcnxcccccccccccccccccccccccccccccccc').valid,
  'Spec invalid case repeated characters (32 "c"s in product name) rejected',
);
assert(!validateProductName('P'.repeat(151)).valid, 'Product name exceeding 150 characters rejected');

// 5. SKU Code
console.log('\n--- 5. SKU Code ---');
assert(validateSku('SKU-1004').valid, 'Standard SKU accepted');
assert(validateSku('MOT_5HP.v2/BL').valid, 'SKU with -, _, ., / accepted');
assert(!validateSku('A').valid, '1-character SKU rejected');
assert(!validateSku('SKU@#$').valid, 'SKU with @#$ rejected');

// 6. Quantity
console.log('\n--- 6. Quantity ---');
assert(validateQuantity(1).valid && validateQuantity(1).value === 1, 'Integer quantity 1 accepted');
assert(validateQuantity('500').valid && validateQuantity('500').value === 500, 'String quantity 500 accepted');
assert(validateQuantity('2.5', true).valid, 'Decimal quantity 2.5 accepted when decimals allowed');
// Invalid:
assert(!validateQuantity(0).valid, 'Spec invalid case quantity 0 rejected');
assert(!validateQuantity(-5).valid, 'Spec invalid case quantity -5 rejected');
assert(!validateQuantity('1e5').valid, 'Spec invalid case quantity "1e5" (exponent) rejected');
assert(!validateQuantity('2.5', false).valid, 'Decimal quantity rejected when item requires integer');
assert(!validateQuantity(100001).valid, 'Quantity exceeding 100,000 rejected');

// 7. Unit Rate
console.log('\n--- 7. Unit Rate ---');
assert(validateUnitRate('2').valid && validateUnitRate('2').value === 2, 'Integer rate "2" accepted');
assert(validateUnitRate('0.5').valid && validateUnitRate('0.5').value === 0.5, 'Decimal rate "0.5" accepted');
assert(validateUnitRate('1450.75').valid && validateUnitRate('1450.75').value === 1450.75, 'Standard price accepted');
// Invalid:
assert(!validateUnitRate('02').valid, 'Spec invalid case rate "02" (leading zero) rejected');
assert(!validateUnitRate('007').valid, 'Rate "007" with leading zeros rejected');
assert(!validateUnitRate('0').valid, 'Spec invalid case rate "0" rejected');
assert(!validateUnitRate('-5').valid, 'Spec invalid case rate "-5" rejected');
assert(!validateUnitRate('1e5').valid, 'Spec invalid case rate "1e5" rejected');
assert(!validateUnitRate('100.999').valid, 'Rate with 3 decimal places rejected');
assert(!validateUnitRate(100000001).valid, 'Rate exceeding 100,000,000 rejected');

// 8. GST Rate
console.log('\n--- 8. GST Rate ---');
assert(validateGstRate(0).valid, 'GST rate 0% accepted');
assert(validateGstRate(5).valid, 'GST rate 5% accepted');
assert(validateGstRate(12).valid, 'GST rate 12% accepted');
assert(validateGstRate(18).valid, 'GST rate 18% accepted');
assert(validateGstRate(28).valid, 'GST rate 28% accepted');
assert(!validateGstRate(7).valid, 'GST rate 7% rejected (not in 0, 5, 12, 18, 28)');
assert(!validateGstRate(-18).valid, 'Negative GST rate rejected');

// 9. Address & Notes & HTML Strip
console.log('\n--- 9. Address & Notes ---');
assert(validateAddress('Flat 402, Sunshine Apartments, MG Road, Bengaluru').valid, 'Valid address accepted');
assert(!validateAddress('A'.repeat(301)).valid, 'Address exceeding 300 chars rejected');
assert(
  stripHtml('<script>alert("hack")</script>Hello <b>World</b>') === 'Hello World',
  'HTML tags stripped from text',
);
assert(validateNotes('Normal notes text').valid, 'Valid notes accepted');
assert(!validateNotes('N'.repeat(1001)).valid, 'Notes exceeding 1000 chars rejected');

// 10. PIN, GSTIN, PAN, IFSC, Bank Account
console.log('\n--- 10. Indian Identifiers & Banking ---');
assert(validatePostalPin('560001').valid, 'Valid 6-digit PIN accepted');
assert(!validatePostalPin('012345').valid, 'PIN starting with 0 rejected');
assert(!validatePostalPin('56000').valid, '5-digit PIN rejected');
assert(!validatePostalPin('5600011').valid, '7-digit PIN rejected');

// GSTIN: 29AAAAA0000A1ZY (Karnataka test dummy format)
assert(validateGstin('29AAAAA0000A1ZY').valid, 'Valid GSTIN format and checksum accepted');
assert(!validateGstin('29AAAAA0000A1Z9').valid, 'GSTIN with wrong checksum digit rejected');
assert(!validateGstin('INVALIDGSTIN').valid, 'Invalid GSTIN length rejected');

// PAN: ABCDE1234F
assert(validatePan('ABCDE1234F').valid, 'Valid PAN accepted');
assert(!validatePan('ABCD1234EF').valid, 'Invalid PAN format rejected');

// IFSC: SBIN0001234
assert(validateIfsc('SBIN0001234').valid, 'Valid IFSC accepted');
assert(!validateIfsc('SBIN1001234').valid, 'IFSC with non-zero 5th char rejected');

// Bank Account: 9 to 18 digits
assert(validateBankAccount('123456789').valid, '9-digit bank account accepted');
assert(validateBankAccount('100000000000000001').valid, '18-digit bank account accepted');
assert(!validateBankAccount('12345678').valid, '8-digit bank account rejected');
assert(!validateBankAccount('1000000000000000001').valid, '19-digit bank account rejected');
assert(!validateBankAccount('12345ABCD').valid, 'Alphanumeric bank account rejected');

// 11. Dates & URLs
console.log('\n--- 11. Dates & URLs ---');
assert(validateDate('2026-10-24').valid, 'Current valid date accepted');
assert(validateDate('2000-01-01').valid, 'Year 2000 date accepted');
assert(!validateDate('1999-12-31').valid, 'Year before 2000 rejected');
assert(!validateDate('2038-01-01').valid, 'Year more than 10 years ahead rejected');
assert(!validateDate('not-a-date').valid, 'Invalid date string rejected');

assert(validateHttpsUrl('https://example.com').valid, 'https URL accepted');
assert(validateHttpsUrl('https://sub.domain.co.in/path/to/page').valid, 'https deep link accepted');
assert(!validateHttpsUrl('http://example.com').valid, 'http URL rejected (https only)');
assert(!validateHttpsUrl('ftp://example.com').valid, 'ftp URL rejected');

// 12. Server Recalculation Engine
console.log('\n--- 12. Server Recalculation Engine ---');
const docLines = [
  { quantity: 2, unitPrice: 500 }, // 1000
  { quantity: 3, unitPrice: 200, discount: 50 }, // 550
];
const calc = calculateDocumentTotals(docLines, 18);
assert(calc.lineTotals[0] === 1000, 'Line 1 total: 1000');
assert(calc.lineTotals[1] === 550, 'Line 2 total: 550 (with 50 discount)');
assert(calc.taxableSubtotal === 1550, 'Taxable subtotal: 1550');
assert(calc.gstAmount === 279, '18% GST: 279');
assert(calc.grandTotal === 1829, 'Grand total: 1829');

console.log('\n========================================================================');
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('========================================================================');

if (failed > 0) process.exit(1);
