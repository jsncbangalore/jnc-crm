import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DocumentSeriesType =
  | 'quotation'
  | 'order'
  | 'tax_invoice'
  | 'sez_invoice'
  | 'proforma'
  | 'delivery_challan'
  | 'credit_note'
  | 'receipt'
  | 'payment';

export const DEFAULT_SERIES_PREFIXES: Record<string, string> = {
  quotation: 'QTN',
  order: 'ORD',
  tax_invoice: 'INV',
  sez_invoice: 'SEZ',
  proforma: 'PF',
  proforma_invoice: 'PF',
  delivery_challan: 'DC',
  credit_note: 'CN',
  receipt: 'REC',
  payment: 'PAY',
};

/**
 * Derives Indian Financial Year string (e.g. '25-26', '26-27') from a date.
 * Fiscal year begins on 1 April and ends on 31 March.
 */
export function getIndianFinancialYearCode(date: Date | string = new Date()): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr, 11 = Dec

  let startYear: number;
  let endYear: number;

  if (month >= 3) {
    // 1 April to 31 December
    startYear = year;
    endYear = year + 1;
  } else {
    // 1 January to 31 March
    startYear = year - 1;
    endYear = year;
  }

  const startCode = String(startYear).slice(-2);
  const endCode = String(endYear).slice(-2);
  return `${startCode}-${endCode}`;
}

@Injectable()
export class DocumentSeriesService {
  private readonly logger = new Logger(DocumentSeriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically acquires and reserves the next document number in the series.
   * MUST be executed inside an active database transaction (tx) to guarantee:
   * 1. Absolute uniqueness even under 50+ concurrent requests.
   * 2. Rollback safety: if the transaction aborts, nextNumber does not leak.
   * 3. Strict chronological numbering per financial year (1 April to 31 March).
   */
  async getNextDocumentNumber(
    tenantId: string,
    docType: DocumentSeriesType | string,
    date: Date = new Date(),
    customTx?: Prisma.TransactionClient | PrismaClient,
    customPrefix?: string
  ): Promise<{
    formattedNumber: string;
    number: number;
    prefix: string;
    financialYear: string;
  }> {
    const fy = getIndianFinancialYearCode(date);

    const executeNumbering = async (client: Prisma.TransactionClient | PrismaClient) => {
      // Resolve prefix (override > tenant invoice prefix > default)
      let prefix = (customPrefix || '').trim().toUpperCase();
      if (!prefix) {
        if (docType === 'tax_invoice') {
          const tenant = await client.tenant.findUnique({
            where: { id: tenantId },
            select: { invoicePrefix: true },
          });
          prefix = tenant?.invoicePrefix?.trim().toUpperCase() || 'INV';
        } else {
          prefix = DEFAULT_SERIES_PREFIXES[docType as DocumentSeriesType] || 'DOC';
        }
      }

      // Explicit row locking via SELECT ... FOR UPDATE to serialize concurrent number allocations
      const rows = await (client as any).$queryRaw`
        SELECT "id", "nextNumber", "prefix"
        FROM "DocumentSeries"
        WHERE "tenantId" = ${tenantId} AND "docType" = ${docType} AND "financialYear" = ${fy}
        FOR UPDATE
      `;

      let currentNumber: number;

      if (rows && rows.length > 0) {
        currentNumber = rows[0].nextNumber;
        await client.documentSeries.update({
          where: { id: rows[0].id },
          data: {
            nextNumber: { increment: 1 },
            prefix,
          },
        });
      } else {
        // First document for this series & financial year: atomic upsert guarantees row creation lock
        const upserted = await client.documentSeries.upsert({
          where: {
            tenantId_docType_financialYear: {
              tenantId,
              docType,
              financialYear: fy,
            },
          },
          create: {
            tenantId,
            docType,
            financialYear: fy,
            prefix,
            nextNumber: 2,
          },
          update: {
            nextNumber: { increment: 1 },
            prefix,
          },
          select: {
            nextNumber: true,
            prefix: true,
          },
        });
        currentNumber = upserted.nextNumber - 1;
      }

      const paddedNumber = String(currentNumber).padStart(4, '0');
      const formattedNumber = `${prefix}/${fy}/${paddedNumber}`;

      return {
        formattedNumber,
        number: currentNumber,
        prefix,
        financialYear: fy,
      };
    };

    if (customTx) {
      return executeNumbering(customTx);
    }
    return this.prisma.$transaction(async (innerTx) => {
      return executeNumbering(innerTx);
    });
  }
}
