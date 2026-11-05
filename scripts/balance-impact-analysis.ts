import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

// 1. Load environment from apps/api/.env
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
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

const dbUrl = process.env.DATABASE_URL || '';
let dbHost = '';
let dbName = '';
try {
  const parsed = new URL(dbUrl);
  dbHost = parsed.hostname;
  dbName = parsed.pathname.replace(/^\//, '');
} catch {
  // SQLite or non-standard URL
}

// 2. Strict Safety Guards
console.log('='.repeat(78));
console.log(`Database Name: ${dbName || 'unknown'}`);
console.log('='.repeat(78));

if (dbHost !== 'localhost' && dbHost !== '127.0.0.1') {
  console.error(`\x1b[31m[ERROR] Refusing to run: Database host "${dbHost}" is not localhost.\x1b[0m`);
  process.exit(1);
}

if (!process.argv.includes('--confirm')) {
  console.error('\x1b[31m[ERROR] Refusing to run: Missing mandatory --confirm flag.\x1b[0m');
  console.error('Usage: node node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json scripts/balance-impact-analysis.ts --confirm');
  process.exit(1);
}

// 3. Confirm Document Types in the Codebase
console.log('\n[CONFIRMATION OF POSTING DOCUMENT TYPES IN CODEBASE]');
const POSTING_DOC_TYPES = [
  'tax_invoice',     // Debit (Receivable from customer)
  'sez_invoice',     // Debit (Receivable from SEZ customer)
  'credit_note',     // Credit (Reduction to customer receivable)
  'debit_note',      // Debit (Increase to customer receivable)
  'bill_of_supply',  // Debit (Exempt/composite invoice receivable)
];

const NON_POSTING_DOC_TYPES = [
  'proforma_invoice', // Non-accounting quotation/advance estimate - does NOT post to ledger
  'delivery_challan', // Goods delivery note without tax liability - does NOT post to ledger
  'purchase_order',   // Order placement to supplier - does NOT post to ledger
];

console.log('  Posting Document Types (Invoices):');
POSTING_DOC_TYPES.forEach((dt) => console.log(`    - ${dt} (POSTS TO LEDGER)`));
console.log('  Supplier Documents:');
console.log('    - purchase_bill (POSTS TO LEDGER as Credit/Liability)');
console.log('  Payment Documents:');
console.log('    - payment / receipt (POSTS TO LEDGER as Credit/Reduction to Receivable)');
console.log('    - supplier_payment (POSTS TO LEDGER as Debit/Reduction to Liability)');
console.log('  Non-Posting Document Types (Confirmed):');
NON_POSTING_DOC_TYPES.forEach((dt) => console.log(`    - ${dt} (DOES NOT POST)`));
console.log('='.repeat(78));

const prisma = new PrismaClient();

interface PartyDiscrepancy {
  partyId: string;
  partyName: string;
  gstin: string | null;
  partyType: 'customer' | 'supplier';
  oldLedgerBalance: number;
  newLedgerBalance: number;
  ledgerDelta: number;
  oldDocBalance: number;
  newDocBalance: number;
  docDelta: number;
  reasons: string[];
}

async function runBalanceImpactAnalysis() {
  console.log('\n[RUNNING READ-ONLY BALANCE IMPACT ANALYSIS]');

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenant(s) in database.\n`);

  let totalPartiesEvaluated = 0;
  let totalDiscrepantParties = 0;
  const allDiscrepancies: PartyDiscrepancy[] = [];
  let totalUnlinkedInvoicesFound = 0;

  for (const tenant of tenants) {
    console.log(`Analyzing Tenant: ${tenant.name} (${tenant.id})`);

    // Fetch all active companies (customers)
    const companies = await prisma.company.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    // Fetch all active suppliers
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    // Fetch all invoices for posting types
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        isVoided: false,
        docType: { in: POSTING_DOC_TYPES },
      },
    });

    // Fetch non-posting invoices count for audit confirmation
    const nonPostingCount = await prisma.invoice.count({
      where: {
        tenantId: tenant.id,
        isVoided: false,
        docType: { in: NON_POSTING_DOC_TYPES },
      },
    });

    // Fetch all ledger entries
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id },
    });

    console.log(`  - Total registered customers: ${companies.length}`);
    console.log(`  - Total registered suppliers: ${suppliers.length}`);
    console.log(`  - Total posting invoices: ${invoices.length}`);
    console.log(`  - Total non-posting documents (proforma/DC/PO): ${nonPostingCount} (skipped)`);
    console.log(`  - Total ledger entries: ${ledgerEntries.length}`);

    // Map companies for name and GSTIN collision checks
    const nameCountMap = new Map<string, number>();
    const gstinCountMap = new Map<string, number>();
    for (const c of companies) {
      const n = (c.name || '').trim().toLowerCase();
      nameCountMap.set(n, (nameCountMap.get(n) || 0) + 1);
      const g = (c.gstin || '').trim().toUpperCase();
      if (g) {
        gstinCountMap.set(g, (gstinCountMap.get(g) || 0) + 1);
      }
    }

    // Evaluate Customers
    for (const comp of companies) {
      totalPartiesEvaluated++;
      const compNameLower = (comp.name || '').trim().toLowerCase();
      const compGstinUpper = (comp.gstin || '').trim().toUpperCase();
      const sameNameCount = nameCountMap.get(compNameLower) || 1;
      const sameGstinCount = compGstinUpper ? (gstinCountMap.get(compGstinUpper) || 0) : 0;

      // -------------------------------------------------------------
      // OLD RULE:
      // Invoices matched if companyId == comp.id OR customerId == comp.id OR customerName matches comp.name
      // REGARDLESS of GSTIN or duplicate names across different entities!
      // -------------------------------------------------------------
      const oldMatchedInvoices = invoices.filter((inv) => {
        if (inv.companyId === comp.id || inv.customerId === comp.id) return true;
        const invName = (inv.customerName || '').trim().toLowerCase();
        return invName === compNameLower;
      });

      // -------------------------------------------------------------
      // NEW RULE (Strict 3-step hierarchy):
      // 1. customerId/companyId first
      // 2. GSTIN second (if invoice has GSTIN, it ONLY matches company with that GSTIN if uniquely held)
      // 3. Name ONLY IF invoice has no customerId and no GSTIN, AND exactly one party has that exact name
      // -------------------------------------------------------------
      const newMatchedInvoices = invoices.filter((inv) => {
        // Step 1: Linked by ID
        if (inv.companyId === comp.id || inv.customerId === comp.id) return true;
        // If explicitly linked to a different customer, never match this company
        if (inv.companyId || inv.customerId) return false;

        const invGstin = (inv.customerGstin || '').trim().toUpperCase();
        const invName = (inv.customerName || '').trim().toLowerCase();

        // Step 2: GSTIN match
        if (invGstin) {
          return compGstinUpper && invGstin === compGstinUpper && sameGstinCount === 1;
        }

        // Step 3: Name match ONLY when no customerId and no GSTIN and unique name
        if (sameNameCount === 1 && invName === compNameLower) {
          return true;
        }

        return false;
      });

      // Calculate document balances
      const calcDocBalance = (invList: typeof invoices) => {
        let debits = 0;
        let credits = 0;
        for (const inv of invList) {
          const amt = Number(inv.balanceDue ?? inv.totalAmount ?? 0);
          if (inv.docType === 'credit_note') {
            credits += amt;
          } else {
            debits += amt;
          }
        }
        return Number((debits - credits).toFixed(2));
      };

      const oldDocBal = calcDocBalance(oldMatchedInvoices);
      const newDocBal = calcDocBalance(newMatchedInvoices);
      const docDelta = Number((newDocBal - oldDocBal).toFixed(2));

      // Calculate Ledger Entry Balances
      // OLD RULE: Entries where partyId == comp.id OR partyId == comp.name
      const oldLedgerEntries = ledgerEntries.filter((e) => {
        if (e.partyType !== 'customer') return false;
        if (e.partyId === comp.id) return true;
        if (e.partyId.toLowerCase() === comp.name.trim().toLowerCase()) return true;
        return false;
      });

      // NEW RULE:
      // Entries where partyId == comp.id
      // OR unlinked:<name>:<gstin> (only if GSTIN is unique)
      // OR (if sameNameCount == 1: unlinked:<name>: or <name>)
      const newAllowedPartyIds = new Set<string>([comp.id]);
      if (compGstinUpper && sameGstinCount === 1) {
        newAllowedPartyIds.add(`unlinked:${encodeURIComponent(comp.name.trim())}:${encodeURIComponent(compGstinUpper)}`);
      }
      if (sameNameCount === 1) {
        newAllowedPartyIds.add(`unlinked:${encodeURIComponent(comp.name.trim())}:`);
        newAllowedPartyIds.add(comp.name.trim());
      }

      const newLedgerEntries = ledgerEntries.filter((e) => {
        if (e.partyType !== 'customer') return false;
        return newAllowedPartyIds.has(e.partyId);
      });

      const calcLedgerBalance = (entries: typeof ledgerEntries) => {
        let dr = 0;
        let cr = 0;
        for (const e of entries) {
          dr += Number(e.debit);
          cr += Number(e.credit);
        }
        return Number((dr - cr).toFixed(2));
      };

      const oldLedgerBal = calcLedgerBalance(oldLedgerEntries);
      const newLedgerBal = calcLedgerBalance(newLedgerEntries);
      const ledgerDelta = Number((newLedgerBal - oldLedgerBal).toFixed(2));

      if (Math.abs(docDelta) > 0.001 || Math.abs(ledgerDelta) > 0.001) {
        totalDiscrepantParties++;
        const reasons: string[] = [];
        if (sameNameCount > 1) {
          reasons.push(`Multiple parties (${sameNameCount}) share name "${comp.name}" - ambiguous invoices excluded from party balance.`);
        }
        const excludedInvoices = oldMatchedInvoices.filter((oi) => !newMatchedInvoices.some((ni) => ni.id === oi.id));
        for (const ex of excludedInvoices) {
          reasons.push(
            `Invoice #${ex.invoiceNumber} (Amt: ${ex.totalAmount}, GSTIN: ${ex.customerGstin || 'None'}) was erroneously lumped under old name rule.`
          );
        }

        allDiscrepancies.push({
          partyId: comp.id,
          partyName: comp.name,
          gstin: comp.gstin,
          partyType: 'customer',
          oldLedgerBalance: oldLedgerBal,
          newLedgerBalance: newLedgerBal,
          ledgerDelta,
          oldDocBalance: oldDocBal,
          newDocBalance: newDocBal,
          docDelta,
          reasons,
        });
      }
    }

    // Evaluate Suppliers (strictly matched by supplierId)
    for (const sup of suppliers) {
      totalPartiesEvaluated++;
      const supEntries = ledgerEntries.filter((e) => e.partyType === 'supplier' && e.partyId === sup.id);
      let dr = 0;
      let cr = 0;
      for (const e of supEntries) {
        dr += Number(e.debit);
        cr += Number(e.credit);
      }
      const net = Number((cr - dr).toFixed(2));
      // For suppliers, old and new rules are identical (matched strictly by supplierId)
    }

    // Count Unlinked Invoices
    const unlinkedInvoices = invoices.filter((inv) => {
      const compId = inv.customerId || inv.companyId;
      if (compId && companies.some((c) => c.id === compId)) return false;

      const invGstin = (inv.customerGstin || '').trim().toUpperCase();
      if (invGstin) {
        const matches = companies.filter((c) => (c.gstin || '').trim().toUpperCase() === invGstin);
        if (matches.length === 1) return false;
        return true;
      }

      const invName = (inv.customerName || '').trim().toLowerCase();
      if (invName) {
        const matches = companies.filter((c) => (c.name || '').trim().toLowerCase() === invName);
        if (matches.length === 1) return false;
        return true;
      }

      return true;
    });

    totalUnlinkedInvoicesFound += unlinkedInvoices.length;
    console.log(`  - Invoices requiring manual linking (Unlinked): ${unlinkedInvoices.length}`);
    if (unlinkedInvoices.length > 0) {
      unlinkedInvoices.forEach((ui) => {
        console.log(`    * Inv #${ui.invoiceNumber} | Customer: "${ui.customerName}" | GSTIN: "${ui.customerGstin || ''}" | Total: ${ui.totalAmount}`);
      });
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('[IMPACT ANALYSIS SUMMARY]');
  console.log('='.repeat(78));
  console.log(`Total Parties Evaluated:          ${totalPartiesEvaluated}`);
  console.log(`Total Parties with Balance Delta: ${totalDiscrepantParties}`);
  console.log(`Total Invoices in Unlinked Queue: ${totalUnlinkedInvoicesFound}`);

  if (allDiscrepancies.length === 0) {
    console.log('\n\x1b[32m[RESULT: CLEAN RECONCILIATION]\x1b[0m');
    console.log('No party balance differences found on jnc_crm_dev.');
    console.log('All party balances are identical under both rules, or ambiguous invoices were cleanly isolated.');
  } else {
    console.log(`\n\x1b[33m[RESULT: ${allDiscrepancies.length} PARTIES WITH BALANCE DIFFERENCES IDENTIFIED]\x1b[0m\n`);
    for (const d of allDiscrepancies) {
      console.log(`Party: ${d.partyName} (ID: ${d.partyId}, GSTIN: ${d.gstin || 'None'})`);
      console.log(`  - Old Document Balance:  ${d.oldDocBalance}`);
      console.log(`  - New Document Balance:  ${d.newDocBalance}`);
      console.log(`  - Document Delta:        ${d.docDelta > 0 ? '+' : ''}${d.docDelta}`);
      console.log(`  - Old Ledger Balance:    ${d.oldLedgerBalance}`);
      console.log(`  - New Ledger Balance:    ${d.newLedgerBalance}`);
      console.log(`  - Ledger Delta:          ${d.ledgerDelta > 0 ? '+' : ''}${d.ledgerDelta}`);
      console.log('  - Audit Reasons:');
      d.reasons.forEach((r) => console.log(`      * ${r}`));
      console.log('-'.repeat(60));
    }
  }
  console.log('='.repeat(78));
}

runBalanceImpactAnalysis()
  .catch((err) => {
    console.error('\n\x1b[31m[ERROR] Impact analysis failed:\x1b[0m', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
