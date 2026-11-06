import { describe, it, expect, vi } from 'vitest';
import { invoiceHasAdvanceReceipt } from '../../scripts/historical_advance_correction';

describe('historical_advance_correction - Advance Receipt Verification', () => {
  it('correctly identifies one corrected invoice (with advance receipt) and one uncorrected invoice (missing advance receipt)', async () => {
    const correctedInvoiceId = 'inv-corrected-001';
    const uncorrectedInvoiceId = 'inv-uncorrected-002';

    // Mock Prisma Client with PaymentAllocation and PaymentRecord relation
    const mockPrisma = {
      paymentAllocation: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: any }) => {
          if (where.invoiceId === correctedInvoiceId && where.paymentRecord?.paymentType === 'advance') {
            return {
              id: 'alloc-123',
              invoiceId: correctedInvoiceId,
              paymentRecordId: 'pay-rec-123',
              amount: 2500,
              paymentRecord: {
                id: 'pay-rec-123',
                paymentType: 'advance',
                amount: 2500,
              },
            };
          }
          // For uncorrected invoice, no advance allocation exists
          return null;
        }),
      },
    } as any;

    // 1. Verify corrected invoice: returns TRUE
    const hasAdvanceCorrected = await invoiceHasAdvanceReceipt(mockPrisma, correctedInvoiceId);
    expect(hasAdvanceCorrected).toBe(true);
    expect(mockPrisma.paymentAllocation.findFirst).toHaveBeenCalledWith({
      where: {
        invoiceId: correctedInvoiceId,
        paymentRecord: {
          paymentType: 'advance',
        },
      },
      include: {
        paymentRecord: true,
      },
    });

    // 2. Verify uncorrected invoice: returns FALSE
    const hasAdvanceUncorrected = await invoiceHasAdvanceReceipt(mockPrisma, uncorrectedInvoiceId);
    expect(hasAdvanceUncorrected).toBe(false);
    expect(mockPrisma.paymentAllocation.findFirst).toHaveBeenCalledWith({
      where: {
        invoiceId: uncorrectedInvoiceId,
        paymentRecord: {
          paymentType: 'advance',
        },
      },
      include: {
        paymentRecord: true,
      },
    });
  });
});
