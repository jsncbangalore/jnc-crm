const { Pool } = require('./apps/api/node_modules/pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' });

async function restore() {
  const receipts = await pool.query("SELECT id, number, amount, reference_number FROM payment_receipts WHERE reference_number LIKE 'UTR-TEST-%'");
  console.log('Test receipts created during e2e:', receipts.rows);
  if (receipts.rows.length > 0) {
    const ids = receipts.rows.map(r => r.id);
    await pool.query('DELETE FROM payment_allocations WHERE payment_receipt_id = ANY($1)', [ids]);
    await pool.query("DELETE FROM ledger_entries WHERE reference_id = ANY($1) OR reference_number LIKE 'UTR-TEST-%'", [ids]);
    await pool.query('DELETE FROM payment_receipts WHERE id = ANY($1)', [ids]);
    console.log('Removed test receipts and allocations.');
    
    // Reset invoice balance_dues for Customer A
    await pool.query("UPDATE invoices SET balance_due = 1180, payment_status = 'unpaid' WHERE number = 'INV/26-27/001'");
    await pool.query("UPDATE invoices SET balance_due = 8225, payment_status = 'unpaid' WHERE number = 'INV/26-27/002'");
    await pool.query("UPDATE invoices SET balance_due = 38651, payment_status = 'unpaid' WHERE number = 'INV/25-26/001'");
    await pool.query("UPDATE invoices SET balance_due = 112442, payment_status = 'partially_paid' WHERE number = 'INV/26-27/003'");
    console.log('Restored invoice balances.');
  }
  await pool.end();
}
restore().catch(console.error);
