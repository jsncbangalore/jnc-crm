const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev' }
  }
});

async function main() {
  const loginRes = await fetch('http://127.0.0.1:3333/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'SecurePass123!' })
  });
  const { accessToken } = await loginRes.json();

  const kpiRes = await fetch('http://127.0.0.1:3333/api/v1/dashboard/kpis', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const kpis = await kpiRes.json();
  console.log('Current Dashboard KPI Total Receivable:', kpis.kpis?.invoices?.unpaidAmount);

  const recRes = await fetch('http://127.0.0.1:3333/api/v1/ledger/reconciliation', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const rec = await recRes.json();
  console.log('Reconciliation totalReceivable:', rec.totalReceivable);
  console.log('Customer balances:');
  for (const c of rec.customers) {
    console.log(`- ${c.partyName}: Ledger=${c.ledgerBalance}, NetDocs=${c.netDocumentBalance}, Diff=${c.discrepancy}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
