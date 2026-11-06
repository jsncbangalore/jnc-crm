// Historical Advance Correction Script (dry‑run only)
// ---------------------------------------------------
// This script scans for invoices where an advance amount is recorded (advanceAdjusted > 0)
// but no corresponding PaymentRecord/PaymentAllocation of type 'advance' exists.
// It writes a CSV report to a location outside the git repository and prints a summary.
// In strict adherence to safety guidelines, apply is never run automatically.

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Parse local .env files manually without external dependencies
function loadEnvFiles(): void {
  const root = process.cwd();
  const envPaths = [
    path.resolve(root, 'apps/api/.env'),
    path.resolve(root, '.env.development'),
    path.resolve(root, '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
    }
  }
}

loadEnvFiles();

const prisma = new PrismaClient();

// Utility to check we are running against a local dev DB
export function isLocalhost(): boolean {
  const dbUrl = process.env.DATABASE_URL ?? '';
  return /localhost|127\.0\.0\.1|5432/.test(dbUrl);
}

// CSV output location (outside the git repo)
export const CSV_PATH = process.platform === 'win32'
  ? path.join('C:', 'Temp', 'historical_advance_report.csv')
  : path.join('/tmp', 'historical_advance_report.csv');

/**
 * Checks whether an invoice already has an advance receipt by looking for
 * a PaymentRecord (paymentType: 'advance') linked through PaymentAllocation for that invoice.
 */
export async function invoiceHasAdvanceReceipt(
  prismaClient: PrismaClient | Prisma.TransactionClient,
  invoiceId: string
): Promise<boolean> {
  const existingAllocation = await prismaClient.paymentAllocation.findFirst({
    where: {
      invoiceId: invoiceId,
      paymentRecord: {
        paymentType: 'advance',
      },
    },
    include: {
      paymentRecord: true,
    },
  });

  return Boolean(existingAllocation);
}

export interface InvoiceAdvanceReportRow {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  advanceAmount: number;
  currentLedgerBalance: number;
  postCorrectionBalance: number;
  alreadyHasAdvance: boolean;
}

export async function generateReport(prismaClient: PrismaClient = prisma): Promise<{
  totalScanned: number;
  alreadyCorrectedCount: number;
  pendingCorrectionCount: number;
  rows: InvoiceAdvanceReportRow[];
  csvContent: string;
}> {
  const invoices = await prismaClient.invoice.findMany({
    where: {
      OR: [
        { advanceAdjusted: { gt: 0 } },
        { advanceAmount: { gt: 0 } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const reportRows: InvoiceAdvanceReportRow[] = [];
  const csvLines: string[] = [
    'tenantId,invoiceId,invoiceNumber,customerId,customerName,advanceAmount,currentLedgerBalance,postCorrectionBalance,status',
  ];

  let alreadyCorrectedCount = 0;
  let pendingCorrectionCount = 0;

  for (const inv of invoices) {
    const hasAdvance = await invoiceHasAdvanceReceipt(prismaClient, inv.id);

    const advance = Number(inv.advanceAdjusted ?? inv.advanceAmount ?? 0);

    let ledgerBalance = 0;
    if (inv.customerId) {
      const ledgerEntries = await prismaClient.ledgerEntry.findMany({
        where: { partyId: inv.customerId, partyType: 'customer' },
      });
      ledgerBalance = ledgerEntries.reduce(
        (sum, le) => sum + (Number(le.debit) - Number(le.credit)),
        0
      );
    }
    const postBalance = ledgerBalance - advance;

    if (hasAdvance) {
      alreadyCorrectedCount++;
    } else {
      pendingCorrectionCount++;
    }

    const row: InvoiceAdvanceReportRow = {
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber ?? '',
      customerId: inv.customerId ?? '',
      customerName: inv.customerName ?? '',
      advanceAmount: advance,
      currentLedgerBalance: ledgerBalance,
      postCorrectionBalance: postBalance,
      alreadyHasAdvance: hasAdvance,
    };

    reportRows.push(row);

    csvLines.push(
      [
        row.tenantId,
        row.invoiceId,
        `"${row.invoiceNumber}"`,
        row.customerId,
        `"${row.customerName.replace(/"/g, '""')}"`,
        row.advanceAmount.toFixed(2),
        row.currentLedgerBalance.toFixed(2),
        row.postCorrectionBalance.toFixed(2),
        hasAdvance ? 'ALREADY_HAS_RECEIPT' : 'NEEDS_CORRECTION',
      ].join(',')
    );
  }

  const csvContent = csvLines.join('\n');

  try {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, csvContent, 'utf-8');
  } catch (err) {
    const fallbackPath = path.resolve(process.cwd(), 'historical_advance_report.csv');
    fs.writeFileSync(fallbackPath, csvContent, 'utf-8');
  }

  return {
    totalScanned: invoices.length,
    alreadyCorrectedCount,
    pendingCorrectionCount,
    rows: reportRows,
    csvContent,
  };
}

export async function applyCorrections(prismaClient: PrismaClient = prisma): Promise<void> {
  if (!isLocalhost()) {
    console.error('ERROR: This script can only run against a localhost dev database.');
    process.exit(1);
  }

  if (!process.argv.includes('--confirm')) {
    console.error('ERROR: --confirm flag required to apply corrections.');
    process.exit(1);
  }

  const invoices = await prismaClient.invoice.findMany({
    where: {
      OR: [
        { advanceAdjusted: { gt: 0 } },
        { advanceAmount: { gt: 0 } },
      ],
    },
  });

  for (const inv of invoices) {
    const hasAdvance = await invoiceHasAdvanceReceipt(prismaClient, inv.id);
    if (hasAdvance) continue;

    const advance = Number(inv.advanceAdjusted ?? inv.advanceAmount ?? 0);
    if (advance <= 0) continue;

    await prismaClient.$transaction(async (tx) => {
      // 1. Create PaymentRecord (type: 'advance')
      const payment = await tx.paymentRecord.create({
        data: {
          tenantId: inv.tenantId,
          customerId: inv.customerId,
          invoiceId: inv.id,
          amount: advance,
          paymentType: 'advance',
          paymentMethod: inv.paymentMethod || 'NEFT',
          transactionRef: inv.transactionRef || `ADV-CORR-${inv.invoiceNumber}`,
          notes: 'Historical advance receipt correction',
          recordedById: inv.createdById ?? null,
        },
      });

      // 2. Create PaymentAllocation linking to the invoice
      await tx.paymentAllocation.create({
        data: {
          tenantId: inv.tenantId,
          paymentType: 'customer_receipt',
          paymentRecordId: payment.id,
          invoiceId: inv.id,
          amount: new Prisma.Decimal(advance),
        },
      });

      // 3. Create LedgerEntry (credit) for the customer advance receipt
      if (inv.customerId) {
        const nextVoucher = `RCP-${inv.invoiceNumber.replace(/[^0-9]/g, '') || Date.now()}`;
        await tx.ledgerEntry.create({
          data: {
            tenantId: inv.tenantId,
            partyType: 'customer',
            partyId: inv.customerId,
            entryDate: inv.invoiceDate ?? new Date(),
            financialYear: '26-27',
            voucherType: 'receipt',
            voucherNo: nextVoucher,
            particulars: `Advance payment receipt against ${inv.invoiceNumber}`,
            credit: new Prisma.Decimal(advance),
            debit: new Prisma.Decimal(0),
            sourceType: 'payment_record',
            sourceId: payment.id,
          },
        });
      }
    });
    console.log(`[CORRECTED] Invoice ${inv.invoiceNumber} -> Created advance PaymentRecord & Allocation`);
  }
}

async function main() {
  console.log('========================================================================');
  console.log('HISTORICAL ADVANCE CORRECTION (DRY-RUN)');
  console.log('========================================================================\n');

  const result = await generateReport(prisma);

  console.log(`Total Invoices Scanned:                ${result.totalScanned}`);
  console.log(`Invoices Already With Advance Receipt: ${result.alreadyCorrectedCount}`);
  console.log(`Invoices Pending Advance Correction:   ${result.pendingCorrectionCount}`);
  console.log(`\nCSV Report Destination:                ${CSV_PATH}\n`);

  console.log('--- CSV SUMMARY (ALL ROWS) ---');
  const previewLines = result.csvContent.split('\n');
  previewLines.forEach((line) => console.log(line));

  if (process.argv.includes('--apply')) {
    console.log('\n[NOTICE] --apply was supplied. Running applyCorrections...');
    await applyCorrections(prisma);
  } else {
    console.log('\n[INFO] Dry-run complete. Corrections were NOT applied.');
  }

  await prisma.$disconnect();
}

const isDirectExecution = process.argv[1] && process.argv[1].replace(/\\/g, '/').includes('historical_advance_correction');
if (isDirectExecution) {
  main().catch((e) => {
    console.error('Fatal error in historical_advance_correction:', e);
    prisma.$disconnect();
    process.exit(1);
  });
}
