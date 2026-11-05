import {
  formatDisplayDate,
  validatePaymentReference,
  getPaymentReferenceHint,
  validateGstin,
} from '@crm/shared-validation';

function runTests() {
  console.log('====================================================');
  console.log('RUNNING TEST SUITE FOR BUG C & D RULES');
  console.log('====================================================\n');

  let failures: string[] = [];

  // 1. DATE FORMAT TESTS ('05 Nov 2026')
  console.log('--- 1. Shared Date Format (05 Nov 2026) ---');
  const d1 = formatDisplayDate('2026-11-05');
  const d2 = formatDisplayDate('2026-11-05T10:30:00.000Z');
  const d3 = formatDisplayDate(new Date('2026-11-05T00:00:00Z'));
  const d4 = formatDisplayDate('2026-01-09');

  if (d1 === '05 Nov 2026') {
    console.log('[PASS] formatDisplayDate("2026-11-05") -> "05 Nov 2026"');
  } else {
    failures.push(`formatDisplayDate("2026-11-05") expected "05 Nov 2026" but got "${d1}"`);
  }

  if (d4 === '09 Jan 2026') {
    console.log('[PASS] formatDisplayDate("2026-01-09") -> "09 Jan 2026" (padded day)');
  } else {
    failures.push(`formatDisplayDate("2026-01-09") expected "09 Jan 2026" but got "${d4}"`);
  }

  // 2. REFERENCE RULES BY MODE
  console.log('\n--- 2. Reference Rules by Mode ---');

  // 2.1 UPI: 12 digits
  console.log('Checking UPI (12 digits)...');
  const upiValid = validatePaymentReference('UPI', '123456789012');
  const upiShort = validatePaymentReference('UPI', '12345678901');
  const upiLong = validatePaymentReference('UPI', '1234567890123');
  const upiAlpha = validatePaymentReference('UPI', '12345678901A');

  if (upiValid.valid && !upiShort.valid && !upiLong.valid && !upiAlpha.valid) {
    console.log('[PASS] UPI reference strictly accepts only 12 digits');
  } else {
    failures.push('UPI reference rule failure');
  }

  // 2.2 Cheque: 6 digits
  console.log('Checking Cheque (6 digits)...');
  const chqValid = validatePaymentReference('Cheque', '123456');
  const chqShort = validatePaymentReference('Cheque', '12345');
  const chqLong = validatePaymentReference('Cheque', '1234567');
  const chqAlpha = validatePaymentReference('Cheque', '12345A');

  if (chqValid.valid && !chqShort.valid && !chqLong.valid && !chqAlpha.valid) {
    console.log('[PASS] Cheque reference strictly accepts only 6 digits');
  } else {
    failures.push('Cheque reference rule failure');
  }

  // 2.3 NEFT / RTGS / IMPS: 8 to 22 letters and digits
  console.log('Checking NEFT/RTGS/IMPS (8 to 22 letters and digits)...');
  const neft8 = validatePaymentReference('NEFT', 'ABC12345');
  const neft22 = validatePaymentReference('NEFT', 'ABCDEF1234567890ABCDEF');
  const neftShort = validatePaymentReference('NEFT', 'ABC1234'); // 7 chars
  const neftLong = validatePaymentReference('NEFT', 'ABCDEF1234567890ABCDEF1'); // 23 chars
  const neftSpecial = validatePaymentReference('NEFT', 'ABC12345-'); // hyphen not allowed now

  if (neft8.valid && neft22.valid && !neftShort.valid && !neftLong.valid && !neftSpecial.valid) {
    console.log('[PASS] NEFT/RTGS/IMPS strictly accepts 8 to 22 letters and digits');
  } else {
    failures.push('NEFT/RTGS/IMPS reference rule failure');
    console.error({ neft8, neft22, neftShort, neftLong, neftSpecial });
  }

  const neftHint = getPaymentReferenceHint('NEFT');
  if (neftHint === 'NEFT/RTGS/IMPS reference must be 8 to 22 letters and digits.') {
    console.log('[PASS] NEFT hint updated to 8 to 22 letters and digits');
  } else {
    failures.push(`NEFT hint unexpected: "${neftHint}"`);
  }

  // 2.4 Cash: none
  console.log('Checking Cash (none)...');
  const cashEmpty = validatePaymentReference('Cash', '');
  const cashNull = validatePaymentReference('Cash', null);
  const cashWithVal = validatePaymentReference('Cash', 'REF123');

  if (cashEmpty.valid && cashNull.valid && !cashWithVal.valid) {
    console.log('[PASS] Cash requires no reference and rejects provided references');
  } else {
    failures.push('Cash reference rule failure');
    console.error({ cashEmpty, cashNull, cashWithVal });
  }

  // 3. GSTIN VALIDATION RULE (same as customer modal)
  console.log('\n--- 3. GSTIN Validation Rule (Same as Customer Modal) ---');
  const gstinValid = validateGstin('29AAAAA0000A1ZY');
  const gstinEmpty = validateGstin('');
  const gstinInvalidFormat = validateGstin('29INVALID0000');
  const gstinBadChecksum = validateGstin('29AAAAA0000A1ZZ');

  if (gstinValid.valid && gstinEmpty.valid && !gstinInvalidFormat.valid && !gstinBadChecksum.valid) {
    console.log('[PASS] GSTIN validation correctly accepts valid & empty optional, rejects invalid format & checksum');
  } else {
    failures.push('GSTIN validation rule failure');
    console.error({ gstinValid, gstinEmpty, gstinInvalidFormat, gstinBadChecksum });
  }

  console.log('\n====================================================');
  if (failures.length === 0) {
    console.log('ALL UNIT & CONTRACT VALIDATION CHECKS PASSED!');
  } else {
    console.error(`FAILURES (${failures.length}):`, failures);
    process.exit(1);
  }
  console.log('====================================================');
}

runTests();
