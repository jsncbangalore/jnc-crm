/**
 * QA Test Suite for Item 2 & Item 3:
 * 1. NameField only for person names (rejects digits, &, (), etc.)
 * 2. Company / Customer / Supplier / Product / Address names accept digits & common symbols:
 *    - 'A&B Traders'
 *    - '3M India'
 *    - 'Sri Ganesh (P) Ltd.'
 *    - 'Unit #4 Logistics'
 * 3. PhoneField landline mode accepts 6 to 12 digits (with/without STD code)
 * 4. Mobile mode strictly enforces 10 digits starting 6-9
 */

const path = require('path');
const {
  validatePersonOrCompanyName,
  validateCompanyName,
  validateNameField,
  validatePhone,
  validatePhoneField,
  normalizeToE164,
  comparePhoneNumbers,
} = require(path.resolve(__dirname, '../packages/shared-validation/dist/index.js'));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

console.log('\n--- 1. Testing Company Name Validation with Required Test Cases ---');

const companyTestCases = [
  'A&B Traders',
  '3M India',
  'Sri Ganesh (P) Ltd.',
  'Unit #4 Logistics',
  'Acme & Sons (P) Ltd. / South-North',
  'O\'Reilly & Associates, Inc.',
];

for (const name of companyTestCases) {
  const res = validatePersonOrCompanyName(name);
  assert(res.valid === true, `validatePersonOrCompanyName accepts '${name}'`);
  const cRes = validateCompanyName(name);
  assert(cRes.valid === true, `validateCompanyName accepts '${name}'`);
}

console.log('\n--- 2. Testing NameField Restriction (Person Names Only) ---');

// Person names should pass
const personNames = ['Rahul Sharma', 'Mary-Jane O\'Connor', 'Dr. A. P. J. Kalam'];
for (const p of personNames) {
  const res = validateNameField(p);
  assert(res.valid === true, `validateNameField accepts person name '${p}'`);
}

// Company names with digits or &, (), # should FAIL in NameField
const nonPersonNames = [
  { name: '3M India', reason: 'digits rejected' },
  { name: 'A&B Traders', reason: '& symbol rejected' },
  { name: 'Sri Ganesh (P) Ltd.', reason: 'parentheses rejected' },
  { name: 'Unit #4', reason: '# symbol rejected' },
];

for (const { name, reason } of nonPersonNames) {
  const res = validateNameField(name);
  assert(res.valid === false && res.error === 'Use letters only.', `validateNameField rejects '${name}' (${reason}) with 'Use letters only.'`);
}

console.log('\n--- 3. Testing Phone Landline / Other Mode (6 to 12 Digits) ---');

const landlineTestCases = [
  { raw: '0802345678', desc: '10-digit STD + local (Bengaluru)' },
  { raw: '08012345678', desc: '11-digit STD + local' },
  { raw: '01123456789', desc: '11-digit Delhi landline' },
  { raw: '2345678', desc: '7-digit local number' },
  { raw: '123456', desc: '6-digit minimum landline' },
  { raw: '082123456789', desc: '12-digit max STD + local' },
];

for (const { raw, desc } of landlineTestCases) {
  const res = validatePhone(raw, 'landline');
  assert(res.valid === true, `validatePhone(landline) accepts ${raw} (${desc})`);
  const fieldRes = validatePhoneField(raw, '+91', 'landline');
  assert(fieldRes.valid === true, `validatePhoneField(landline) accepts ${raw} (${desc})`);
}

console.log('\n--- 4. Testing Phone Landline Rejections (< 6 or > 12 digits) ---');

assert(validatePhone('12345', 'landline').valid === false, 'validatePhone(landline) rejects 5 digits (<6)');
assert(validatePhone('1234567890123', 'landline').valid === false, 'validatePhone(landline) rejects 13 digits (>12)');

console.log('\n--- 5. Testing Mobile Mode Strictness (10 Digits Starting 6-9) ---');

assert(validatePhone('9876543210', 'mobile').valid === true, 'validatePhone(mobile) accepts 9876543210');
assert(validatePhone('8023456789', 'mobile').valid === true, 'validatePhone(mobile) accepts 8023456789');
assert(validatePhone('5876543210', 'mobile').valid === false, 'validatePhone(mobile) rejects mobile starting with 5');
assert(validatePhone('0802345678', 'mobile').valid === false, 'validatePhone(mobile) rejects 0-prefixed landline');

console.log(`\nTests Summary: ${passed} Passed, ${failed} Failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All QA checks passed successfully!\n');
}
