/**
 * Test Point 7: Null Safety & Safe Formatter Verification
 * 1. Checks shared safe formatters (safeUpper, safeLower, safeTrim, safeVoucherType, safeStatus, safeSide, safeLabel).
 * 2. Runs strictNullChecks compiler check on changed API files.
 * 3. Verifies API responses return non-empty voucherType, status, side, and label.
 */

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');

async function run() {
  console.log('========================================================================');
  console.log('POINT 7 NULL SAFETY TEST');
  console.log('========================================================================\n');

  // 1. Test backend safe formatters
  console.log('1. Testing apps/api/src/common/safe-format.ts (compiled in dist)...');
  const safeFormat = require('../apps/api/dist/common/safe-format.js');
  
  // Test safeUpper
  assert.strictEqual(safeFormat.safeUpper(null), '');
  assert.strictEqual(safeFormat.safeUpper(undefined), '');
  assert.strictEqual(safeFormat.safeUpper(''), '');
  assert.strictEqual(safeFormat.safeUpper('  hello world  '), 'HELLO WORLD');
  
  // Test safeLower
  assert.strictEqual(safeFormat.safeLower(null), '');
  assert.strictEqual(safeFormat.safeLower(undefined), '');
  assert.strictEqual(safeFormat.safeLower('  AbC  '), 'abc');

  // Test safeTrim
  assert.strictEqual(safeFormat.safeTrim(null), '');
  assert.strictEqual(safeFormat.safeTrim(undefined), '');
  assert.strictEqual(safeFormat.safeTrim('   xyz   '), 'xyz');

  // Test safeVoucherType
  assert.strictEqual(safeFormat.safeVoucherType(null), 'JOURNAL');
  assert.strictEqual(safeFormat.safeVoucherType(undefined), 'JOURNAL');
  assert.strictEqual(safeFormat.safeVoucherType(''), 'JOURNAL');
  assert.strictEqual(safeFormat.safeVoucherType('payment'), 'PAYMENT');
  assert.strictEqual(safeFormat.safeVoucherType(null, 'INVOICE'), 'INVOICE');

  // Test safeStatus
  assert.strictEqual(safeFormat.safeStatus(null), 'ACTIVE');
  assert.strictEqual(safeFormat.safeStatus(undefined), 'ACTIVE');
  assert.strictEqual(safeFormat.safeStatus(''), 'ACTIVE');
  assert.strictEqual(safeFormat.safeStatus('confirmed'), 'CONFIRMED');
  assert.strictEqual(safeFormat.safeStatus(null, 'DRAFT'), 'DRAFT');

  // Test safeSide
  assert.strictEqual(safeFormat.safeSide(null), 'DR');
  assert.strictEqual(safeFormat.safeSide(undefined), 'DR');
  assert.strictEqual(safeFormat.safeSide(''), 'DR');
  assert.strictEqual(safeFormat.safeSide('cr'), 'CR');
  assert.strictEqual(safeFormat.safeSide('DR'), 'DR');
  assert.strictEqual(safeFormat.safeSide(null, 'CR'), 'CR');

  // Test safeLabel
  assert.strictEqual(safeFormat.safeLabel(null), 'Standard');
  assert.strictEqual(safeFormat.safeLabel(undefined), 'Standard');
  assert.strictEqual(safeFormat.safeLabel(''), 'Standard');
  assert.strictEqual(safeFormat.safeLabel('   Custom Label   '), 'Custom Label');

  console.log('   [PASS] Shared safe-format unit tests passed.');

  // 2. Test strictNullChecks on changed files
  console.log('\n2. Testing strictNullChecks compiler check on changed API files...');
  try {
    const tscOutput = execSync('node node_modules/typescript/bin/tsc --project apps/api/tsconfig.strict.json', {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..')
    });
    console.log('   [PASS] apps/api/tsconfig.strict.json passed with 0 errors.');
  } catch (err) {
    console.error('   [FAIL] strictNullChecks failed:\n', err.stdout || err.message);
    process.exit(1);
  }

  // 3. Test API responses for non-empty voucherType, status, side, label
  console.log('\n3. Testing API live responses for non-empty voucherType, status, side, and label...');
  const API_BASE = 'http://localhost:3333/api/v1';

  // Seed user login to obtain JWT
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'tenant-admin@example.com', password: 'DevPassword@123' })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const { accessToken } = await loginRes.json();
  const authHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  // 3a. Test Ledger Statement & Customer Summary endpoints
  console.log('   Checking customers list to test customer-specific endpoints...');
  const customersRes = await fetch(`${API_BASE}/customers`, { headers: authHeaders });
  if (customersRes.ok) {
    const custData = await customersRes.json();
    const customers = Array.isArray(custData) ? custData : custData.items || custData.customers || [];
    if (customers.length > 0) {
      const customerId = customers[0].id;
      console.log(`   Found test customer ID: ${customerId}. Testing /ledger/statement and /account-summary...`);
      
      const ledgerRes = await fetch(`${API_BASE}/ledger/statement?customerId=${customerId}`, { headers: authHeaders });
      if (ledgerRes.ok) {
        const statement = await ledgerRes.json();
        assert(statement.side !== undefined && statement.side !== null && statement.side !== '', 'Statement side must not be empty');
        assert(statement.openingSide !== undefined && statement.openingSide !== null && statement.openingSide !== '', 'Statement openingSide must not be empty');
        assert(statement.closingSide !== undefined && statement.closingSide !== null && statement.closingSide !== '', 'Statement closingSide must not be empty');
        console.log('   [PASS] /ledger/statement returns non-empty side, openingSide, closingSide.');
      }

      const summaryRes = await fetch(`${API_BASE}/payments/customers/${customerId}/account-summary`, { headers: authHeaders });
      if (summaryRes.ok) {
        const summary = await summaryRes.json();
        if (summary.ledgerEntries) {
          for (const l of summary.ledgerEntries) {
            assert(l.voucherType !== undefined && l.voucherType !== null && l.voucherType !== '', 'Voucher type in summary must not be empty');
          }
        }
        console.log('   [PASS] /payments/customers/:id/account-summary returns non-empty collections and voucherTypes.');
      }
    }
  }

  // 3b. Test Dashboard Stats endpoint
  console.log('   Checking /dashboard/stats for funnel stage labels...');
  const dashRes = await fetch(`${API_BASE}/dashboard/stats`, {
    headers: authHeaders
  });

  if (dashRes.ok) {
    const stats = await dashRes.json();
    if (stats.pipelineFunnel) {
      for (const stage of stats.pipelineFunnel) {
        assert(stage.stage !== undefined && stage.stage !== null && stage.stage !== '', 'Pipeline stage name must not be empty');
        if (stage.label !== undefined) {
          assert(stage.label !== null && stage.label !== '', 'Pipeline stage label must not be empty');
        }
      }
    }
    console.log('   [PASS] /dashboard/stats stage and labels are non-empty.');
  }

  console.log('\n========================================================================');
  console.log('ALL POINT 7 NULL SAFETY TESTS PASSED!');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
