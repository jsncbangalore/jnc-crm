import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const jwtSecret = process.env.JWT_SECRET || 'dev_secret';
const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('STARTING LEDGER COMPREHENSIVE TEST MATRIX SUITE');
  console.log('Target: jnc_crm_dev on localhost:3333');
  console.log('====================================================\n');

  const tenant = await prisma.tenant.findFirst({
    where: { status: 'active', deletedAt: null },
  });
  if (!tenant) throw new Error('Tenant not found');

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true, deletedAt: null },
  });
  if (!user) throw new Error('User not found');

  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion || 0,
    },
    jwtSecret,
    { issuer: 'crm-api', audience: 'crm-client' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  let failures: string[] = [];

  // ─── 1. Customer created in the modal ('Create & Select') ─────────────
  console.log('--- Test 1: Customer created in modal ("Create & Select") with empty GSTIN ---');
  const cust1Res = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Modal Customer ' + Date.now(),
      phone: '+919876543210',
      state: 'Karnataka',
    }),
  });
  const cust1 = await cust1Res.json();
  const inv1Res = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: cust1.id,
      customerName: cust1.name,
      customerPhone: '+919876543210',
      customerState: 'Karnataka',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'Item 1', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    }),
  });
  const inv1 = await inv1Res.json();

  const parties1Res = await fetch('http://localhost:3333/api/v1/ledger/parties?type=customer', { headers: authHeaders });
  const parties1 = await parties1Res.json();
  const p1 = parties1.find((p: any) => p.partyId === cust1.id);
  const stmt1Res = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust1.id}`, { headers: authHeaders });
  const stmt1 = await stmt1Res.json();
  const docs1Res = await fetch(`http://localhost:3333/api/v1/ledger/open-documents?partyType=customer&partyId=${cust1.id}`, { headers: authHeaders });
  const docs1 = await docs1Res.json();

  if (p1 && p1.closingBalance === 5000 && stmt1.entries?.length >= 1 && docs1.length >= 1) {
    console.log('[PASS] Test 1: Listed with 5,000 DR, statement has entry, open documents has invoice.');
  } else {
    failures.push('Test 1 failed: modal customer invoice missing in ledger/statement/docs');
    console.error('[FAIL] Test 1:', { p1, stmt1Entries: stmt1.entries?.length, docs1Len: docs1.length });
  }

  // ─── 2. Customer typed without linking ────────────────────────────────
  console.log('\n--- Test 2: Customer typed without linking ---');
  const unlinkedName = 'Typed Client ' + Date.now();
  const inv2Res = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerName: unlinkedName,
      customerPhone: '+919876543210',
      customerState: 'Karnataka',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'Adhoc Service', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    }),
  });
  const inv2 = await inv2Res.json();
  const parties2Res = await fetch('http://localhost:3333/api/v1/ledger/parties?type=customer', { headers: authHeaders });
  const parties2 = await parties2Res.json();
  const p2 = parties2.find((p: any) => p.partyName === unlinkedName);
  const stmt2Res = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${encodeURIComponent(p2?.partyId || '')}`, { headers: authHeaders });
  const stmt2 = await stmt2Res.json();
  const docs2Res = await fetch(`http://localhost:3333/api/v1/ledger/open-documents?partyType=customer&partyId=${encodeURIComponent(p2?.partyId || '')}`, { headers: authHeaders });
  const docs2 = await docs2Res.json();

  if (p2 && p2.closingBalance === 5000 && stmt2.entries?.length >= 1 && docs2.length >= 1) {
    console.log('[PASS] Test 2: Unlinked customer listed with 5,000 DR, statement has entry, open documents has invoice.');
  } else {
    failures.push('Test 2 failed: unlinked customer missing in ledger/statement/docs');
    console.error('[FAIL] Test 2:', { p2, stmt2Entries: stmt2.entries?.length, docs2Len: docs2.length });
  }

  // ─── 3. Two customers with the same name ──────────────────────────────
  console.log('\n--- Test 3: Two customers with the exact same name ---');
  const sharedName = 'Identical Name Pvt Ltd ' + Date.now();
  const cust3aRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: sharedName, phone: '+919876543211', state: 'Karnataka' }),
  });
  const cust3a = await cust3aRes.json();
  const cust3bRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: sharedName, phone: '+919876543212', state: 'Maharashtra' }),
  });
  const cust3b = await cust3bRes.json();

  // Create invoice for 3a (4000) and for 3b (7000)
  await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: cust3a.id,
      customerName: sharedName,
      customerPhone: '+919876543211',
      customerState: 'Karnataka',
      lines: [{ description: 'Plan A', quantity: 1, unitPrice: 4000, taxRate: 0 }],
    }),
  });
  await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: cust3b.id,
      customerName: sharedName,
      customerPhone: '+919876543212',
      customerState: 'Maharashtra',
      lines: [{ description: 'Plan B', quantity: 1, unitPrice: 7000, taxRate: 0 }],
    }),
  });

  const stmt3aRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust3a.id}`, { headers: authHeaders });
  const stmt3a = await stmt3aRes.json();
  const stmt3bRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust3b.id}`, { headers: authHeaders });
  const stmt3b = await stmt3bRes.json();

  if (stmt3a.totals?.closingBalance === 4000 && stmt3b.totals?.closingBalance === 7000) {
    console.log('[PASS] Test 3: Customers with identical names strictly isolated (Customer A = 4000 DR, Customer B = 7000 DR).');
  } else {
    failures.push('Test 3 failed: customer collision between same-named accounts');
    console.error('[FAIL] Test 3:', { stmt3aTotal: stmt3a.totals, stmt3bTotal: stmt3b.totals });
  }

  // ─── 4. GSTIN empty vs set ───────────────────────────────────────────
  console.log('\n--- Test 4: GSTIN empty vs set ---');
  const custGstinRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'GSTIN Registered Corp ' + Date.now(),
      gstin: '29AAAAA0000A1ZY',
      phone: '+919876543215',
      state: 'Karnataka',
    }),
  });
  const custGstin = await custGstinRes.json();
  await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: custGstin.id,
      customerName: custGstin.name,
      customerGstin: '29AAAAA0000A1ZY',
      customerPhone: '+919876543215',
      customerState: 'Karnataka',
      lines: [{ description: 'Hardware Server', quantity: 1, unitPrice: 10000, taxRate: 18 }],
    }),
  });
  const stmtGstinRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${custGstin.id}`, { headers: authHeaders });
  const stmtGstin = await stmtGstinRes.json();
  if (stmtGstin.entries?.length >= 1 && stmtGstin.party?.gstin === '29AAAAA0000A1ZY') {
    console.log('[PASS] Test 4: GSTIN set customer correctly recorded in ledger and statement retains GSTIN.');
  } else {
    failures.push('Test 4 failed: GSTIN customer not functioning');
    console.error('[FAIL] Test 4:', stmtGstin);
  }

  // ─── 5. Invoice with an advance amount ────────────────────────────────
  console.log('\n--- Test 5: Invoice with an advance amount ---');
  const custAdvRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Advance Client ' + Date.now(), phone: '+919876543218', state: 'Karnataka' }),
  });
  const custAdv = await custAdvRes.json();
  const invAdvRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerId: custAdv.id,
      customerName: custAdv.name,
      customerPhone: '+919876543218',
      customerState: 'Karnataka',
      advanceAdjusted: 2000,
      lines: [{ description: 'Consulting', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    }),
  });
  const invAdv = await invAdvRes.json();
  const docsAdvRes = await fetch(`http://localhost:3333/api/v1/ledger/open-documents?partyType=customer&partyId=${custAdv.id}`, { headers: authHeaders });
  const docsAdv = await docsAdvRes.json();
  const foundAdvDoc = docsAdv.find((d: any) => d.documentId === invAdv.id);

  if (foundAdvDoc && foundAdvDoc.totalAmount === 5000 && foundAdvDoc.balanceDue === 3000) {
    console.log('[PASS] Test 5: Invoice with advance amount correctly shows totalAmount=5000, balanceDue=3000.');
  } else {
    failures.push('Test 5 failed: advance adjusted invoice balance incorrect');
    console.error('[FAIL] Test 5:', { invAdv, foundAdvDoc });
  }

  // ─── 6. Credit note ──────────────────────────────────────────────────
  console.log('\n--- Test 6: Credit note adjustment ---');
  const cnRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'credit_note',
      customerId: cust1.id,
      customerName: cust1.name,
      customerPhone: '+919876543210',
      customerState: 'Karnataka',
      referenceNo: inv1.invoiceNumber,
      lines: [{ description: 'Defect Rebate', quantity: 1, unitPrice: 1000, taxRate: 0 }],
    }),
  });
  const cn = await cnRes.json();
  const stmt1AfterCnRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust1.id}`, { headers: authHeaders });
  const stmt1AfterCn = await stmt1AfterCnRes.json();

  if (stmt1AfterCn.totals?.creditTotal === 1000 && stmt1AfterCn.totals?.closingBalance === 4000) {
    console.log('[PASS] Test 6: Credit note posted 1,000 Credit, reduced balance to 4,000 DR.');
  } else {
    failures.push('Test 6 failed: credit note did not adjust ledger properly');
    console.error('[FAIL] Test 6:', stmt1AfterCn.totals);
  }

  // ─── 7. Quotation and PO (must NOT appear in Ledger) ──────────────────
  console.log('\n--- Test 7: Quotation and PO (must NOT appear in ledger/statement/open documents) ---');
  const quoteCustRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Quotation Only Client ' + Date.now(), phone: '+919876543219', state: 'Karnataka' }),
  });
  const quoteCust = await quoteCustRes.json();
  const quoteRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'proforma_invoice',
      customerId: quoteCust.id,
      customerName: quoteCust.name,
      customerPhone: '+919876543219',
      customerState: 'Karnataka',
      lines: [{ description: 'Quote Line', quantity: 1, unitPrice: 20000, taxRate: 18 }],
    }),
  });
  const poRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'purchase_order',
      customerId: quoteCust.id,
      customerName: quoteCust.name,
      customerPhone: '+919876543219',
      customerState: 'Karnataka',
      lines: [{ description: 'PO Line', quantity: 1, unitPrice: 25000, taxRate: 18 }],
    }),
  });

  const quoteStmtRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${quoteCust.id}`, { headers: authHeaders });
  const quoteStmt = await quoteStmtRes.json();
  const quoteDocsRes = await fetch(`http://localhost:3333/api/v1/ledger/open-documents?partyType=customer&partyId=${quoteCust.id}`, { headers: authHeaders });
  const quoteDocs = await quoteDocsRes.json();

  if (quoteStmt.entries?.length === 0 && quoteDocs.length === 0 && quoteStmt.totals?.closingBalance === 0) {
    console.log('[PASS] Test 7: Quotation and PO do not post to ledger; statement entries=0, open documents=0.');
  } else {
    failures.push('Test 7 failed: quotation or PO posted to ledger or appeared in open documents');
    console.error('[FAIL] Test 7:', { entries: quoteStmt.entries, docs: quoteDocs });
  }

  // ─── 8. Party list shows party with posted invoice even if Show all is off ──
  console.log('\n--- Test 8: Party list shows party with posted invoice (hasPostedInvoices) ---');
  const partiesTestRes = await fetch('http://localhost:3333/api/v1/ledger/parties?type=customer', { headers: authHeaders });
  const partiesTest = await partiesTestRes.json();
  const foundPostedCust = partiesTest.find((p: any) => p.partyId === cust1.id);

  if (foundPostedCust && foundPostedCust.hasPostedInvoices === true) {
    console.log('[PASS] Test 8: hasPostedInvoices=true on party with posted invoice, ensuring visibility when Show all is off.');
  } else {
    failures.push('Test 8 failed: hasPostedInvoices flag missing or false');
    console.error('[FAIL] Test 8:', foundPostedCust);
  }

  // ─── 9. Same name with different GSTINs ──────────────────────────────
  console.log('\n--- Test 9: Same party name with different GSTINs (never merge parties) ---');
  const sharedNameGstin = 'Dual State Logistics ' + Date.now();
  const randNum = String(Date.now()).slice(-4);
  const gstinA = `29AABCS${randNum}A1Z1`;
  const gstinB = `27AABCS${randNum}B1Z2`;

  const cust9aRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: sharedNameGstin, gstin: gstinA, state: 'Karnataka' }),
  });
  const cust9a = await cust9aRes.json();

  const cust9bRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: sharedNameGstin, gstin: gstinB, state: 'Maharashtra' }),
  });
  const cust9b = await cust9bRes.json();

  // Create unlinked invoice for GSTIN A (no customerId)
  const inv9aRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerName: sharedNameGstin,
      customerGstin: gstinA,
      customerState: 'Karnataka',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'KA Goods', quantity: 1, unitPrice: 12000, taxRate: 0 }],
    }),
  });
  const inv9a = await inv9aRes.json();

  // Create unlinked invoice for GSTIN B (no customerId)
  const inv9bRes = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerName: sharedNameGstin,
      customerGstin: gstinB,
      customerState: 'Maharashtra',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'MH Goods', quantity: 1, unitPrice: 18000, taxRate: 0 }],
    }),
  });
  const inv9b = await inv9bRes.json();

  const stmt9aRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust9a.id}`, { headers: authHeaders });
  const stmt9a = await stmt9aRes.json();
  const stmt9bRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust9b.id}`, { headers: authHeaders });
  const stmt9b = await stmt9bRes.json();

  if (stmt9a.totals?.closingBalance === 12000 && stmt9b.totals?.closingBalance === 18000) {
    console.log('[PASS] Test 9: Same name with different GSTINs never merged (Party A has 12,000 DR, Party B has 18,000 DR).');
  } else {
    failures.push('Test 9 failed: same name different GSTIN parties were merged or mismatched');
    console.error('[FAIL] Test 9:', {
      inv9aStatus: inv9aRes.status,
      inv9a,
      inv9bStatus: inv9bRes.status,
      inv9b,
      stmt9aTotal: stmt9a.totals,
      stmt9bTotal: stmt9b.totals,
    });
  }

  // ─── 10. Typed customer matching exactly one party ────────────────────
  console.log('\n--- Test 10: Typed customer with no GSTIN matching exactly one registered party ---');
  const uniqueNameSingle = 'Solitary Tech Ventures ' + Date.now();
  const cust10Res = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: uniqueNameSingle, state: 'Karnataka' }),
  });
  const cust10 = await cust10Res.json();

  // Invoice without customerId and without GSTIN
  const inv10Res = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerName: uniqueNameSingle,
      customerState: 'Karnataka',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'Sole Service', quantity: 1, unitPrice: 6500, taxRate: 0 }],
    }),
  });
  const inv10 = await inv10Res.json();

  const stmt10Res = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust10.id}`, { headers: authHeaders });
  const stmt10 = await stmt10Res.json();

  // Also verify invoice is NOT in unlinked list because it deterministically matches exactly one customer
  const unlinked10Res = await fetch('http://localhost:3333/api/v1/ledger/unlinked-invoices', { headers: authHeaders });
  const unlinked10 = await unlinked10Res.json();
  const isInUnlinked10 = unlinked10.some((i: any) => i.id === inv10.id);

  if (stmt10.totals?.closingBalance === 6500 && !isInUnlinked10) {
    console.log('[PASS] Test 10: Typed customer matching exactly one party successfully linked to ledger (6,500 DR, not in unlinked list).');
  } else {
    failures.push('Test 10 failed: typed customer matching single party not working properly');
    console.error('[FAIL] Test 10:', { stmt10Total: stmt10.totals, isInUnlinked10 });
  }

  // ─── 11. Matching two parties goes to Unlinked, then links with audit log ─
  console.log('\n--- Test 11: Invoice matching two parties goes to Unlinked, links with audit log ---');
  const ambigName = 'Ambiguous Enterprises ' + Date.now();
  const cust11aRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: ambigName, phone: '+919900000001', state: 'Delhi' }),
  });
  const cust11a = await cust11aRes.json();

  const cust11bRes = await fetch('http://localhost:3333/api/v1/companies', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: ambigName, phone: '+919900000002', state: 'Haryana' }),
  });
  const cust11b = await cust11bRes.json();

  // Create invoice with ambigName but NO customerId and NO GSTIN
  const inv11Res = await fetch('http://localhost:3333/api/v1/invoices/create-direct', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      docType: 'tax_invoice',
      customerName: ambigName,
      customerState: 'Delhi',
      paymentTerms: 'Due on Receipt',
      lines: [{ description: 'Ambiguous Service', quantity: 1, unitPrice: 9900, taxRate: 0 }],
    }),
  });
  const inv11 = await inv11Res.json();

  // 1. Verify neither cust11a nor cust11b got the balance merged
  const stmt11aBeforeRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust11a.id}`, { headers: authHeaders });
  const stmt11aBefore = await stmt11aBeforeRes.json();
  const stmt11bBeforeRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust11b.id}`, { headers: authHeaders });
  const stmt11bBefore = await stmt11bBeforeRes.json();

  // 2. Verify it is present in GET /ledger/unlinked-invoices with ambiguous reason
  const unlinked11Res = await fetch('http://localhost:3333/api/v1/ledger/unlinked-invoices', { headers: authHeaders });
  const unlinked11 = await unlinked11Res.json();
  const foundUnlinked11 = unlinked11.find((i: any) => i.id === inv11.id);

  const correctlyUnlinked = stmt11aBefore.totals?.closingBalance === 0 &&
    stmt11bBefore.totals?.closingBalance === 0 &&
    Boolean(foundUnlinked11) &&
    (foundUnlinked11.reason || '').includes('Ambiguous');

  if (correctlyUnlinked) {
    console.log('[PASS] Test 11a: Invoice matching two parties correctly routed to Unlinked Invoices (Reason: "' + foundUnlinked11.reason + '").');
  } else {
    failures.push('Test 11a failed: ambiguous invoice was merged or missing from unlinked list');
    console.error('[FAIL] Test 11a:', { stmt11aBefore: stmt11aBefore.totals, stmt11bBefore: stmt11bBefore.totals, foundUnlinked11 });
  }

  // 3. Link invoice to cust11a using PATCH /invoices/:id/link-customer
  console.log('Linking invoice to Customer 11a...');
  const linkRes = await fetch(`http://localhost:3333/api/v1/invoices/${inv11.id}/link-customer`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ customerId: cust11a.id }),
  });
  const linkData = await linkRes.json();

  // Verify statement of cust11a now has the invoice (9,900 DR)
  const stmt11aAfterRes = await fetch(`http://localhost:3333/api/v1/ledger/statement?partyType=customer&partyId=${cust11a.id}`, { headers: authHeaders });
  const stmt11aAfter = await stmt11aAfterRes.json();

  // Verify invoice disappeared from unlinked list
  const unlinkedAfterRes = await fetch('http://localhost:3333/api/v1/ledger/unlinked-invoices', { headers: authHeaders });
  const unlinkedAfter = await unlinkedAfterRes.json();
  const stillInUnlinked = unlinkedAfter.some((i: any) => i.id === inv11.id);

  // Verify Audit Log entry exists for LINK_CUSTOMER
  const auditEntry = await prisma.auditLog.findFirst({
    where: {
      tenantId: tenant.id,
      action: 'LINK_CUSTOMER',
      entityId: inv11.id,
    },
  });

  if (linkData.success && stmt11aAfter.totals?.closingBalance === 9900 && !stillInUnlinked && auditEntry) {
    console.log('[PASS] Test 11b: Invoice linked to Customer 11a (closing balance 9,900 DR, removed from unlinked list, audit log verified: action=' + auditEntry.action + ').');
  } else {
    failures.push('Test 11b failed: linking unlinked invoice did not update ledger or audit log');
    console.error('[FAIL] Test 11b:', { linkData, stmt11aAfter: stmt11aAfter.totals, stillInUnlinked, auditEntry });
  }

  console.log('\n====================================================');
  if (failures.length === 0) {
    console.log('ALL 11 TEST MATRIX ITEMS PASSED SUCCESSFULLY!');
  } else {
    console.error(`FAILURES (${failures.length}):`, failures);
    process.exit(1);
  }
  console.log('====================================================');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal test matrix error:', err);
  process.exit(1);
});
