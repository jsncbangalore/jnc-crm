/**
 * Helper: Initialize DocumentSeries table from existing documents
 *
 * Scans existing Quotation, Order, Invoice, and Payment numbers across all tenants,
 * determines the highest sequence number per series and Indian Financial Year,
 * and sets nextNumber = maxNumber + 1.
 *
 * Usage:
 *   node scripts/init-document-series.ts          # Dry run
 *   node scripts/init-document-series.ts --execute # Persist to DB
 */

import { PrismaClient } from '@prisma/client';

export function getIndianFinancialYearCode(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const startStr = String(startYear).slice(-2);
  const endStr = String(endYear).slice(-2);
  return `${startStr}-${endStr}`;
}

export const DEFAULT_SERIES_PREFIXES: Record<string, string> = {
  quotation: 'QTN',
  order: 'ORD',
  tax_invoice: 'INV',
  sez_invoice: 'SEZ',
  proforma_invoice: 'PI',
  delivery_challan: 'DC',
  credit_note: 'CN',
  receipt: 'REC',
  supplier_payment: 'SPAY',
};

const prisma = new PrismaClient();

function extractSequenceNumber(numStr?: string | null): number {
  if (!numStr) return 0;
  // Match the last sequence of digits in strings like "INV/25-26/0042", "ORD-123", "QTN/24-25/0001"
  const match = numStr.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function initDocumentSeries(execute: boolean = false) {
  console.log('========================================================================');
  console.log(`DOCUMENT SERIES INITIALIZATION HELPER [MODE: ${execute ? 'EXECUTE' : 'DRY-RUN'}]`);
  console.log('========================================================================\n');

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, invoicePrefix: true } });

    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const seriesMap = new Map<string, { docType: string; fy: string; prefix: string; maxNum: number; allNums: number[] }>();

      const track = (docType: string, fy: string, prefix: string, num: number) => {
        const key = `${docType}:${fy}`;
        const existing = seriesMap.get(key);
        if (!existing) {
          seriesMap.set(key, { docType, fy, prefix, maxNum: num, allNums: num > 0 ? [num] : [] });
        } else {
          existing.maxNum = Math.max(num, existing.maxNum);
          if (num > 0) existing.allNums.push(num);
        }
      };

      // 1. Quotations
      const quotes = await prisma.quotation.findMany({
        where: { tenantId },
        select: { quoteNumber: true, createdAt: true },
      });
      for (const q of quotes) {
        const fy = getIndianFinancialYearCode(q.createdAt);
        const num = extractSequenceNumber(q.quoteNumber);
        track('quotation', fy, DEFAULT_SERIES_PREFIXES.quotation, num);
      }

      // 2. Orders
      const orders = await prisma.order.findMany({
        where: { tenantId },
        select: { orderNumber: true, createdAt: true },
      });
      for (const o of orders) {
        const fy = getIndianFinancialYearCode(o.createdAt);
        const num = extractSequenceNumber(o.orderNumber);
        track('order', fy, DEFAULT_SERIES_PREFIXES.order, num);
      }

      // 3. Invoices
      const invoices = await prisma.invoice.findMany({
        where: { tenantId },
        select: { invoiceNumber: true, docType: true, invoiceDate: true, createdAt: true },
      });
      for (const inv of invoices) {
        const fy = getIndianFinancialYearCode(inv.invoiceDate || inv.createdAt);
        const num = extractSequenceNumber(inv.invoiceNumber);
        let docType = inv.docType || 'tax_invoice';
        let prefix = tenant.invoicePrefix || 'INV';
        if (docType === 'sez_invoice') prefix = 'SEZ';
        else if (docType === 'proforma') prefix = 'PRO';
        else if (docType === 'delivery_challan') prefix = 'DC';
        else if (docType === 'credit_note') prefix = 'CN';
        track(docType, fy, prefix, num);
      }

      // Display summary table with gaps and duplicates report
      const rows: any[] = [];
      for (const [key, item] of seriesMap.entries()) {
        const nextNumber = item.maxNum + 1;
        const nums = item.allNums.sort((a, b) => a - b);
        const dupes = nums.filter((val, i, arr) => i > 0 && val === arr[i - 1]);
        const uniqueSet = new Set(nums);
        let gapsCount = 0;
        for (let i = 1; i <= item.maxNum; i++) {
          if (!uniqueSet.has(i)) gapsCount++;
        }

        rows.push({
          Series: item.docType,
          FY: item.fy,
          Prefix: item.prefix,
          TotalCount: nums.length,
          Duplicates: dupes.length,
          Gaps: gapsCount,
          HighestFound: item.maxNum,
          NextNumber: nextNumber,
        });

        if (execute) {
          await prisma.documentSeries.upsert({
            where: {
              tenantId_docType_financialYear: {
                tenantId,
                docType: item.docType,
                financialYear: item.fy,
              },
            },
            create: {
              tenantId,
              docType: item.docType,
              financialYear: item.fy,
              prefix: item.prefix,
              nextNumber,
            },
            update: {
              prefix: item.prefix,
              nextNumber,
            },
          });
        }
      }

      console.log(`Tenant ${tenantId} Document Series Status:`);
      console.table(rows);
    }

    console.log('\n[DONE] Document series initialization completed.');
    if (!execute) {
      console.log('Dry run complete. Use --execute to persist series nextNumbers to the database.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isExecute = process.argv.includes('--execute');
initDocumentSeries(isExecute).catch((err) => {
  console.error('Error in initDocumentSeries:', err);
  process.exit(1);
});
