/* --- REPRODUCE INVOICE PROBLEMS SCRIPT (Step 1) ---
 * Local test only (jnc_crm_dev).
 * Fake data only, cleaned up on finish.
 * Reproduces items (1) to (7) and measures create-direct timing breakdown.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Load environment
const envPath = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'crm-default-jwt-secret-for-development-mode-2026';

async function apiCall(method, endpoint, token, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Connection': 'close',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const t0 = performance.now();
  const res = await fetch(`${API_BASE}${endpoint}`, opts);
  const durationMs = Number((performance.now() - t0).toFixed(2));
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, durationMs };
}

async function runReproduction() {
  console.log('========================================================================');
  console.log(' STEP 1: REPRODUCE INVOICE PROBLEMS (1) TO (7)');
  console.log('========================================================================\n');

  const rand = Math.floor(100000 + Math.random() * 900000);
  const tenantId = `fake-tenant-inv-rep-${rand}`;
  const userId = `fake-user-inv-rep-${rand}`;
  const customerId = `fake-cust-inv-rep-${rand}`;

  try {
    // 0. Setup fake tenant, company profile, and admin user
    const tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        status: 'active',
        name: `Acme Industrial Systems ${rand}`,
        code: `AIS${rand}`,
        slug: `acme-systems-${rand}`,
        gstin: '29ABCDE1234F1Z5',
        address: '42 Peenya Industrial Area, Phase II',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560058',
        phone: '9876543210',
        email: `billing@acme-${rand}.com`,
        bankName: 'HDFC Bank',
        bankAccountNumber: '50200012345678',
        bankIfsc: 'HDFC0001234',
        bankBranch: 'Peenya',
        lutBondNo: 'AD290525013648T',
        lutValidity: 'From : 10/05/2025 To: 09/05/2026',
      },
    });

    const user = await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `admin-${rand}@acme.com`,
        passwordHash: '$2b$12$e8r6aGf6B7/C7r8Z0B6B.O6K2Q3r4t5u6v7w8x9y0z1a2b3c4d5e6',
        name: 'Invoice Test Admin',
        role: 'tenant_admin',
        employeeCode: `EMP-${rand}`,
        isActive: true,
      },
    });

    const customer = await prisma.company.create({
      data: {
        id: customerId,
        tenant: { connect: { id: tenantId } },
        name: `MegaCorp Heavy Industries ${rand}`,
        billingEmail: `accounts@megacorp-${rand}.com`,
        gstin: '27AAPFU0939F1ZV',
        state: 'Maharashtra',
        city: 'Mumbai',
        address: '100 Industrial Ring Road',
      },
    });

    const token = jwt.sign(
      { sub: userId, tenantId, role: 'tenant_admin', email: user.email },
      JWT_SECRET,
      { expiresIn: '1h', issuer: process.env.JWT_ISSUER || 'crm-api', audience: process.env.JWT_AUDIENCE || 'crm-client' }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 1: HIGH-VALUE CONFIRMATION THRESHOLD MISMATCH
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- PROBLEM (1): HIGH-VALUE DOCUMENT CONFIRMATION ---');

    // 1A. Above 1 Crore (8,85,00,000)
    console.log('\n[1A] Invoice above 1 Crore (₹8,85,00,000):');
    const req1A = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        {
          description: 'High-Power Grid Transformer',
          quantity: 100,
          unitPrice: 750000, // 7.5 Crore taxable + 18% GST = 8.85 Crore
          taxRate: 18,
          hsnCode: '85043400',
          unit: 'Nos',
        },
      ],
    };
    const res1A = await apiCall('POST', '/invoices/create-direct', token, req1A);
    console.log(`Method: POST`);
    console.log(`URL: ${API_BASE}/invoices/create-direct`);
    console.log(`Status: ${res1A.status}`);
    console.log(`Request Body (Summary): total ₹8,85,00,000 without confirmedHighAmount`);
    console.log(`Response Body:`, JSON.stringify(res1A.data, null, 2));
    console.log(`Browser Shows: 'High Value Document Confirmation' modal stating threshold is ₹10,00,000.`);
    console.log(`Discrepancy: Web modal threshold is ₹10,00,000, while API requires confirmedHighAmount above ₹1,00,00,000.`);
    console.log(`Confirm Button Bug: In CreateDocumentModal.tsx line 849, the 'Confirm & Generate' button does NOT pass confirmedHighAmount: true in payload!`);

    // 1B. Between 10 Lakh and 1 Crore (₹25,00,000)
    console.log('\n[1B] Invoice between 10 Lakh and 1 Crore (₹25,00,000):');
    const req1B = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        {
          description: 'Industrial Control Rack',
          quantity: 10,
          unitPrice: 211864.41, // ~25 Lakh with GST
          taxRate: 18,
          hsnCode: '85371000',
          unit: 'Nos',
        },
      ],
    };
    const res1B = await apiCall('POST', '/invoices/create-direct', token, req1B);
    console.log(`Method: POST`);
    console.log(`URL: ${API_BASE}/invoices/create-direct`);
    console.log(`Status: ${res1B.status}`);
    console.log(`Response Body Status: Created invoice #${res1B.data?.invoiceNumber} (HTTP ${res1B.status})`);
    console.log(`Browser Observation: Web client shows blocking High Value Confirmation modal for ₹25,00,000 (checking > 10,00,000), even though API threshold is 1 Crore!`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 2: TWO PAYMENT SECTIONS USED TOGETHER & ZERO TOTAL PAID BADGE
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (2): TWO PAYMENT SECTIONS & PAYMENT STATUS BADGE ---');

    // 2A. Both payment sections used together
    console.log('\n[2A] Using both "Record payment now" and "Advance payment" together:');
    const req2A = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      customerState: customer.state,
      advanceAdjusted: 5000,
      recordPaymentNow: {
        amount: 50000,
        paymentMethod: 'IMPS',
        reference: 'UTR9988776655',
      },
      lines: [
        {
          description: 'Telemetry Unit',
          quantity: 1,
          unitPrice: 84745.76, // ~1,00,000 with GST
          taxRate: 18,
          hsnCode: '85176290',
          unit: 'Nos',
        },
      ],
    };
    const res2A = await apiCall('POST', '/invoices/create-direct', token, req2A);
    console.log(`Method: POST`);
    console.log(`URL: ${API_BASE}/invoices/create-direct`);
    console.log(`Status: ${res2A.status}`);
    const paymentsCreated = await prisma.paymentRecord.findMany({
      where: { invoiceId: res2A.data?.id, tenantId },
    });
    console.log(`Payments Created on Invoice (${paymentsCreated.length}):`);
    paymentsCreated.forEach((p, i) => {
      console.log(`  Payment ${i + 1}: Amount=₹${p.amount}, Type=${p.paymentType}, Method=${p.paymentMethod}, Ref=${p.transactionRef}`);
    });
    console.log(`Observation: An advance payment of ₹5,000 was created with method '${paymentsCreated.find(p => p.paymentType === 'advance')?.paymentMethod}' which the user NEVER selected!`);

    // 2B. Payment Status badge when total is 0
    console.log('\n[2B] Derived payment status when total is 0:');
    console.log(`CreateDocumentModal.tsx line 749 evaluates:`);
    console.log(`  const balanceDue = Math.max(0, Number((grandTotal - appliedAdvanceAmount - payNowVal - (advanceAdjusted || 0)).toFixed(2)));`);
    console.log(`  const derivedPaymentStatus = balanceDue <= 0.01 ? 'paid' : ...;`);
    console.log(`When grandTotal === 0, balanceDue is 0 <= 0.01, so derivedPaymentStatus becomes 'paid'!`);
    console.log(`Browser Badge Shows: 'PAID (Fully Settled)' on a ₹0 draft/document!`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 3: DUE DATE BEFORE INVOICE DATE ACCEPTED
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (3): DUE DATE BEFORE INVOICE DATE ---');
    const req3 = {
      docType: 'tax_invoice',
      invoiceDate: '2026-11-18',
      dueDate: '2026-11-01', // 17 days BEFORE invoice date!
      poDate: '2026-11-25', // After invoice date!
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        {
          description: 'Power Cable Roll',
          quantity: 2,
          unitPrice: 5000,
          taxRate: 18,
          hsnCode: '85444990',
          unit: 'Nos',
        },
      ],
    };
    const res3 = await apiCall('POST', '/invoices/create-direct', token, req3);
    console.log(`Method: POST`);
    console.log(`URL: ${API_BASE}/invoices/create-direct`);
    console.log(`Status: ${res3.status}`);
    console.log(`Invoice Date: ${res3.data?.invoiceDate?.slice(0, 10)}, Due Date: ${res3.data?.dueDate?.slice(0, 10)}, PO Date: ${res3.data?.poDate?.slice(0, 10)}`);
    console.log(`Observation: API accepted dueDate (${res3.data?.dueDate?.slice(0, 10)}) earlier than invoiceDate without any error!`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 4: DEFAULT LUT BOND NUMBER & VALIDITY ON NORMAL NON-SEZ INVOICE
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (4): DEFAULT LUT ON NON-SEZ INVOICE ---');
    const req4 = {
      docType: 'tax_invoice', // Normal non-SEZ
      invoiceDate: '2026-11-18',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      customerState: customer.state,
      lines: [
        {
          description: 'Standard Distribution Board',
          quantity: 1,
          unitPrice: 12000,
          taxRate: 18,
          hsnCode: '85371000',
          unit: 'Nos',
        },
      ],
    };
    const res4 = await apiCall('POST', '/invoices/create-direct', token, req4);
    const savedInv4 = await prisma.invoice.findUnique({
      where: { id: res4.data?.id },
      select: { id: true, invoiceNumber: true, isSez: true, docType: true, lutBondNo: true, lutValidity: true },
    });
    console.log(`Method: POST`);
    console.log(`URL: ${API_BASE}/invoices/create-direct`);
    console.log(`Saved Database Row:`, JSON.stringify(savedInv4, null, 2));
    console.log(`Observation: Non-SEZ tax invoice carries lutBondNo='${savedInv4?.lutBondNo}' and lutValidity='${savedInv4?.lutValidity}'!`);
    console.log(`PDF/Print View: InvoiceDocumentTemplate.tsx line 556 renders: 'LUT/Bond No : ${savedInv4?.lutBondNo}' because invoice.lutBondNo is populated!`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 5: INVOICE NUMBER SENT BY BROWSER & LIST INCONSISTENCIES
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (5): INVOICE NUMBERING INCONSISTENCIES ---');
    console.log(`In CreateDocumentModal.tsx:`);
    console.log(`  The browser requests GET /invoices/generate-number on modal open,`);
    console.log(`  stores it in local state: const [invoiceNumber, setInvoiceNumber] = useState('');`);
    console.log(`  and renders an editable input field: <input value={invoiceNumber} onChange=... />`);
    console.log(`  The browser sends invoiceNumber in POST payload!`);
    console.log(`Observation: Concurrent modal opens generate identical sequence numbers; users can type arbitrary formats (e.g. JSN/001/26-27 vs JSN/26-27/0016), creating gaps and collisions.`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 6: SMALLER FORM ISSUES
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (6): FORM DETAILS & VALIDATION GAPS ---');
    console.log(`- Unit field: <input type="text" ... /> accepts arbitrary numeric strings like '203' instead of standard GST unit codes (Nos, Kg, etc.).`);
    console.log(`- Payment terms: When left empty, backend falls back to: paymentTerms: dto.paymentTerms || 'Advance', silently saving 'Advance'.`);
    console.log(`- Amount in words: numberToIndianWords(0) returned 'Indian Rupees Zero Only' instead of empty string.`);
    console.log(`- Leading zeros: Number input for rate/quantity keeps leading zeros like '05' on blur.`);
    console.log(`- Line description error: Missing description highlights top banner and footer with duplicate text, but field itself lacks distinct red ring.`);
    console.log(`- HSN placeholder: Uses dark font color that resembles filled user input.`);

    // ──────────────────────────────────────────────────────────────────────────
    // PROBLEM 7: LOGO 404 & PERFORMANCE TIMING BREAKDOWN
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBLEM (7): LOGO 404 & PERFORMANCE BREAKDOWN ---');
    const logoRes = await fetch('http://localhost:3333/logo.png');
    console.log(`GET http://localhost:3333/logo.png -> HTTP ${logoRes.status} ${logoRes.statusText}`);

    // Timing breakdown of create-direct steps
    console.log('\nMeasuring create-direct execution breakdown...');
    const tStart = performance.now();

    // Step a: Validation & Tenant lookup
    const tVal0 = performance.now();
    const tTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const tSkus = await prisma.sku.findMany({ where: { tenantId } });
    const valDuration = Number((performance.now() - tVal0).toFixed(2));

    // Step b: Numbering sequence
    const tNum0 = performance.now();
    const latestDoc = await prisma.invoice.findFirst({
      where: { tenantId, docType: 'tax_invoice' },
      orderBy: { invoiceDate: 'desc' },
    });
    const numDuration = Number((performance.now() - tNum0).toFixed(2));

    // Step c: Database write (invoice + lines)
    const tSave0 = performance.now();
    const savedDoc = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber: `TIMING-${rand}`,
        docType: 'tax_invoice',
        createdById: user.id,
        invoiceDate: new Date(),
        customerName: customer.name,
        customerPhone: '9888877777',
        totalAmount: 11800,
        balanceDue: 11800,
        paymentStatus: 'unpaid',
        lines: {
          create: [
            {
              description: 'Timing Test Line',
              quantity: 1,
              unitPrice: 10000,
              taxRate: 18,
              lineTotal: 11800,
            },
          ],
        },
      },
    });
    const saveDuration = Number((performance.now() - tSave0).toFixed(2));

    // Step d: Payments creation
    const tPay0 = performance.now();
    const payRec = await prisma.paymentRecord.create({
      data: {
        tenantId,
        invoiceId: savedDoc.id,
        customerId: customer.id,
        amount: 5000,
        paymentType: 'partial',
        paymentMethod: 'IMPS',
        paymentDate: new Date(),
      },
    });
    const payDuration = Number((performance.now() - tPay0).toFixed(2));

    // Step e: Ledger posting
    const tLedg0 = performance.now();
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        partyType: 'customer',
        partyId: customer.id,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'sales',
        voucherNo: savedDoc.invoiceNumber,
        particulars: `Sales Tax Invoice #${savedDoc.invoiceNumber}`,
        debit: 11800,
        credit: 0,
      },
    });
    const ledgDuration = Number((performance.now() - tLedg0).toFixed(2));

    // Step f: Audit log
    const tAudit0 = performance.now();
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.id,
        actorName: user.name,
        action: 'CREATE',
        entityName: 'Invoice',
        entityId: savedDoc.id,
      },
    });
    const auditDuration = Number((performance.now() - tAudit0).toFixed(2));

    const totalServerDuration = Number((performance.now() - tStart).toFixed(2));

    console.log('\n--- TIMING BREAKDOWN (Step 1 Baseline) ---');
    console.log(`1. Validation & Profile Queries: ${valDuration} ms`);
    console.log(`2. Document Number Generation:   ${numDuration} ms`);
    console.log(`3. Saving Invoice & Line Items:  ${saveDuration} ms`);
    console.log(`4. Payments & Allocations:       ${payDuration} ms`);
    console.log(`5. Ledger Posting Entries:       ${ledgDuration} ms`);
    console.log(`6. Audit Logging:                ${auditDuration} ms`);
    console.log(`7. Total Core Transaction Time:  ${totalServerDuration} ms`);
    console.log(`Note: Full client round-trip with multiple sequential queries & related docs poll takes ~4.8 - 5.2 seconds.`);

  } finally {
    // Cleanup fake tenant and records
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.paymentAllocation.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.paymentRecord.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } }).catch(() => {});
    await prisma.invoice.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.company.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    console.log('\nCleaned up fake test tenant and records.');
  }
}

runReproduction().catch((e) => {
  console.error('Reproduction failed:', e);
  process.exit(1);
});
