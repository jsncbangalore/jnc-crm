/**
 * STEP 1 - MONEY SAFETY & TRANSACTION INTEGRITY VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Multi-write single interactive transaction behavior
 * 2. Fault injection at every stage (number taken, invoice insert, ledger posting, balance update)
 *    and assertion that NOTHING persists on failure
 * 3. 20 parallel creations -> unique sequential numbers, no collisions, no timestamp suffixes
 * 4. 10 parallel payments on 1 invoice -> atomic balance updates, no overpayment, correct allocations
 * 5. Scheduled reconciliation check -> reports orphan entries, unposted docs, number gaps
 */

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/jnc_crm_dev?schema=public';

const { PrismaClient, Prisma } = require('@prisma/client');
const assert = require('assert');

const prisma = new PrismaClient();

function getIndianFinancialYearCode(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

async function getNextDocumentNumberTx(tx, tenantId, docType, prefix = 'INV') {
  const fy = getIndianFinancialYearCode(new Date());

  // Explicit row locking via SELECT ... FOR UPDATE
  const rows = await tx.$queryRaw`
    SELECT "id", "nextNumber", "prefix"
    FROM "DocumentSeries"
    WHERE "tenantId" = ${tenantId} AND "docType" = ${docType} AND "financialYear" = ${fy}
    FOR UPDATE
  `;

  let currentNumber;
  if (rows && rows.length > 0) {
    currentNumber = rows[0].nextNumber;
    await tx.documentSeries.update({
      where: { id: rows[0].id },
      data: { nextNumber: { increment: 1 }, prefix },
    });
  } else {
    const upserted = await tx.documentSeries.upsert({
      where: {
        tenantId_docType_financialYear: { tenantId, docType, financialYear: fy },
      },
      create: { tenantId, docType, financialYear: fy, prefix, nextNumber: 2 },
      update: { nextNumber: { increment: 1 }, prefix },
      select: { nextNumber: true },
    });
    currentNumber = upserted.nextNumber - 1;
  }

  const padded = String(currentNumber).padStart(4, '0');
  return {
    formattedNumber: `${prefix}/${fy}/${padded}`,
    number: currentNumber,
    financialYear: fy,
  };
}

async function runStep1MoneySafetySuite() {
  console.log('================================================================');
  console.log('STEP 1 - MONEY SAFETY & TRANSACTION INTEGRITY VERIFICATION SUITE');
  console.log('Database: jnc_crm_dev');
  console.log('================================================================\n');

  // Setup isolated test tenant
  const testTenantCode = `ms-test-${Date.now()}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Money Safety Test Co',
      code: testTenantCode,
      slug: testTenantCode,
      state: 'Karnataka',
      gstin: '29ABCDE1234F1Z5',
      address: '100 Test Blvd, Bengaluru',
      bankName: 'HDFC Bank',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      invoicePrefix: 'MST',
    },
  });

  const testUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `tester-${Date.now()}@internal.local`,
      passwordHash: 'dummy-hash',
      role: 'tenant_admin',
      name: 'Money Safety Tester',
      employeeCode: 'MST-001',
    },
  });

  const customer = await prisma.company.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      name: 'Customer Test Ltd',
      state: 'Karnataka',
      gstin: '29XYZAB5678C1Z2',
      billingEmail: 'customer@test.local',
      createdBy: { connect: { id: testUser.id } },
    },
  });

  console.log(`[SETUP] Initialized Test Tenant (code: ${testTenantCode})`);

  let passedTests = 0;
  let totalTests = 0;

  async function test(name, fn) {
    totalTests++;
    process.stdout.write(`TEST ${totalTests}: ${name} ... `);
    try {
      await fn();
      console.log('PASSED [OK]');
      passedTests++;
    } catch (err) {
      console.log('FAILED [X]');
      console.error(err);
      process.exitCode = 1;
    }
  }

  // ─── FAULT INJECTION TESTS ───────────────────────────────────────────────

  await test('Fault Injection 1: Abort after numbering row lock -> sequence does not advance, no doc created', async () => {
    const fy = getIndianFinancialYearCode(new Date());

    // Initialize sequence row at nextNumber = 1
    await prisma.documentSeries.upsert({
      where: {
        tenantId_docType_financialYear: { tenantId: tenant.id, docType: 'tax_invoice', financialYear: fy },
      },
      create: { tenantId: tenant.id, docType: 'tax_invoice', financialYear: fy, prefix: 'MST', nextNumber: 1 },
      update: { nextNumber: 1 },
    });

    let caughtError = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Acquire number inside tx
        const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');
        assert.strictEqual(numInfo.number, 1);

        // INJECT FAULT: Simulated crash/abort before invoice insert
        throw new Error('SIMULATED_FAULT_AFTER_NUMBERING');
      });
    } catch (err) {
      if (err.message === 'SIMULATED_FAULT_AFTER_NUMBERING') {
        caughtError = true;
      } else {
        throw err;
      }
    }
    assert.strictEqual(caughtError, true, 'Fault was caught');

    // Assert DB state: sequence row MUST still be nextNumber = 1 (did not leak or increment!)
    const seriesRow = await prisma.documentSeries.findUnique({
      where: {
        tenantId_docType_financialYear: { tenantId: tenant.id, docType: 'tax_invoice', financialYear: fy },
      },
    });
    assert.strictEqual(seriesRow.nextNumber, 1, 'Sequence nextNumber rolled back cleanly to 1');

    const invoiceCount = await prisma.invoice.count({ where: { tenantId: tenant.id } });
    assert.strictEqual(invoiceCount, 0, 'No invoice persisted');
  });

  await test('Fault Injection 2: Abort after invoice insert -> invoice & lines completely rollback', async () => {
    const fy = getIndianFinancialYearCode(new Date());
    let caughtError = false;

    try {
      await prisma.$transaction(async (tx) => {
        const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');

        await tx.invoice.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            companyId: customer.id,
            invoiceNumber: numInfo.formattedNumber,
            docType: 'tax_invoice',
            customerName: customer.name,
            customerPhone: '9999999999',
            customerState: 'Karnataka',
            subtotal: 1000,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            totalAmount: 1180,
            balanceDue: 1180,
            paymentStatus: 'unpaid',
            lines: {
              create: [
                {
                  description: 'Fault Injection Item 1',
                  quantity: 1,
                  unitPrice: 1000,
                  lineTotal: 1180,
                },
              ],
            },
          },
        });

        // INJECT FAULT: Error after invoice insert
        throw new Error('SIMULATED_FAULT_AFTER_INVOICE_INSERT');
      });
    } catch (err) {
      if (err.message === 'SIMULATED_FAULT_AFTER_INVOICE_INSERT') {
        caughtError = true;
      } else {
        throw err;
      }
    }
    assert.strictEqual(caughtError, true);

    const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id } });
    assert.strictEqual(invoices.length, 0, 'Zero invoices persisted after rollback');

    const lines = await prisma.invoiceLine.findMany({ where: { invoice: { tenantId: tenant.id } } });
    assert.strictEqual(lines.length, 0, 'Zero invoice lines persisted after rollback');

    const seriesRow = await prisma.documentSeries.findUnique({
      where: { tenantId_docType_financialYear: { tenantId: tenant.id, docType: 'tax_invoice', financialYear: fy } },
    });
    assert.strictEqual(seriesRow.nextNumber, 1, 'Sequence number not consumed');
  });

  await test('Fault Injection 3: Abort after ledger entry -> ledger entry, invoice and numbering rollback', async () => {
    const fy = getIndianFinancialYearCode(new Date());
    let caughtError = false;

    try {
      await prisma.$transaction(async (tx) => {
        const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');

        const inv = await tx.invoice.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            invoiceNumber: numInfo.formattedNumber,
            docType: 'tax_invoice',
            customerName: customer.name,
            customerPhone: '9999999999',
            totalAmount: 5000,
            balanceDue: 5000,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            tenantId: tenant.id,
            partyType: 'customer',
            partyId: customer.id,
            entryDate: new Date(),
            financialYear: fy,
            voucherType: 'sales',
            voucherNo: inv.invoiceNumber,
            particulars: `Sales Invoice #${inv.invoiceNumber}`,
            debit: new Prisma.Decimal('5000.00'),
            credit: new Prisma.Decimal('0.00'),
            sourceType: 'invoice',
            sourceId: inv.id,
          },
        });

        // INJECT FAULT: Abort right after ledger entry before commit
        throw new Error('SIMULATED_FAULT_AFTER_LEDGER_ENTRY');
      });
    } catch (err) {
      if (err.message === 'SIMULATED_FAULT_AFTER_LEDGER_ENTRY') {
        caughtError = true;
      } else {
        throw err;
      }
    }
    assert.strictEqual(caughtError, true);

    const ledgerEntries = await prisma.ledgerEntry.findMany({ where: { tenantId: tenant.id } });
    assert.strictEqual(ledgerEntries.length, 0, 'No ledger entry persisted');

    const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id } });
    assert.strictEqual(invoices.length, 0, 'No invoice persisted');
  });

  await test('Fault Injection 4: Abort during payment after balance change -> invoice balance restored & no payment persisted', async () => {
    const fy = getIndianFinancialYearCode(new Date());

    // Create a real posted invoice
    const inv = await prisma.$transaction(async (tx) => {
      const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');
      const doc = await tx.invoice.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          invoiceNumber: numInfo.formattedNumber,
          docType: 'tax_invoice',
          customerName: customer.name,
          customerPhone: '9999999999',
          totalAmount: 10000,
          balanceDue: 10000,
          paymentStatus: 'unpaid',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId: tenant.id,
          partyType: 'customer',
          partyId: customer.id,
          entryDate: new Date(),
          financialYear: fy,
          voucherType: 'sales',
          voucherNo: doc.invoiceNumber,
          particulars: `Sales #${doc.invoiceNumber}`,
          debit: new Prisma.Decimal('10000.00'),
          credit: new Prisma.Decimal('0.00'),
          sourceType: 'invoice',
          sourceId: doc.id,
        },
      });
      return doc;
    });

    assert.strictEqual(Number(inv.balanceDue), 10000);

    // Simulate payment attempt that fails after updating invoice balance
    let caughtError = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Update invoice balance to 6000
        await tx.invoice.update({
          where: { id: inv.id },
          data: { balanceDue: 6000, paymentStatus: 'partial' },
        });

        // Step 2: Create payment record
        await tx.paymentRecord.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            invoiceId: inv.id,
            amount: 4000,
            paymentType: 'partial',
            paymentMethod: 'NEFT',
            paymentDate: new Date(),
          },
        });

        // INJECT FAULT: Crash before ledger posting
        throw new Error('SIMULATED_FAULT_BEFORE_PAYMENT_LEDGER');
      });
    } catch (err) {
      if (err.message === 'SIMULATED_FAULT_BEFORE_PAYMENT_LEDGER') {
        caughtError = true;
      } else {
        throw err;
      }
    }
    assert.strictEqual(caughtError, true);

    // Verify invoice balance is STILL 10,000 in DB
    const freshInv = await prisma.invoice.findUnique({ where: { id: inv.id } });
    assert.strictEqual(Number(freshInv.balanceDue), 10000, 'Invoice balanceDue remained 10,000');
    assert.strictEqual(freshInv.paymentStatus, 'unpaid', 'Payment status remained unpaid');

    const paymentCount = await prisma.paymentRecord.count({ where: { tenantId: tenant.id } });
    assert.strictEqual(paymentCount, 0, 'No payment record persisted');
  });

  // ─── CONCURRENCY TESTS ───────────────────────────────────────────────────

  await test('Concurrency 1: 20 parallel invoice creations -> 20 distinct sequential numbers, no collisions', async () => {
    const fy = getIndianFinancialYearCode(new Date());

    const parallelCreates = Array.from({ length: 20 }).map((_, idx) => {
      return prisma.$transaction(async (tx) => {
        const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');
        const invoice = await tx.invoice.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            invoiceNumber: numInfo.formattedNumber,
            docType: 'tax_invoice',
            customerName: customer.name,
            customerPhone: '9999999999',
            totalAmount: 100 + idx,
            balanceDue: 100 + idx,
            paymentStatus: 'unpaid',
            lines: {
              create: [
                {
                  description: `Parallel Invoice Line ${idx + 1}`,
                  quantity: 1,
                  unitPrice: 100 + idx,
                  lineTotal: 100 + idx,
                },
              ],
            },
          },
        });

        await tx.ledgerEntry.create({
          data: {
            tenantId: tenant.id,
            partyType: 'customer',
            partyId: customer.id,
            entryDate: new Date(),
            financialYear: fy,
            voucherType: 'sales',
            voucherNo: invoice.invoiceNumber,
            particulars: `Sales Tax Invoice #${invoice.invoiceNumber}`,
            debit: new Prisma.Decimal((100 + idx).toFixed(2)),
            credit: new Prisma.Decimal('0.00'),
            sourceType: 'invoice',
            sourceId: invoice.id,
          },
        });

        return invoice;
      });
    });

    const results = await Promise.all(parallelCreates);
    assert.strictEqual(results.length, 20);

    const invoiceNumbers = results.map((r) => r.invoiceNumber);
    const uniqueNumbers = new Set(invoiceNumbers);
    assert.strictEqual(uniqueNumbers.size, 20, 'All 20 invoice numbers are 100% unique');

    // Verify none have timestamp fallback suffix
    invoiceNumbers.forEach((num) => {
      assert.strictEqual(
        /^MST\/\d{2}-\d{2}\/\d{4}$/.test(num),
        true,
        `Invoice number "${num}" matches strict standard format without timestamp suffix`
      );
    });

    // Extract numerical sequence
    const seqNumbers = invoiceNumbers.map((num) => parseInt(num.split('/')[2], 10)).sort((a, b) => a - b);
    console.log(`\n    Allocated sequence range: ${seqNumbers[0]} -> ${seqNumbers[seqNumbers.length - 1]}`);
    assert.strictEqual(seqNumbers.length, 20);
    // Check no gaps in this batch
    for (let i = 1; i < seqNumbers.length; i++) {
      assert.strictEqual(seqNumbers[i], seqNumbers[i - 1] + 1, `Sequential without gaps: ${seqNumbers[i - 1]} followed by ${seqNumbers[i]}`);
    }
  });

  await test('Concurrency 2: 10 parallel payments on 1 invoice -> exact balance 0.00, atomic allocations', async () => {
    const fy = getIndianFinancialYearCode(new Date());

    // Create target invoice with total = 10,000, balance = 10,000 and post its sales ledger entry
    const targetInvoice = await prisma.$transaction(async (tx) => {
      const numInfo = await getNextDocumentNumberTx(tx, tenant.id, 'tax_invoice', 'MST');
      const doc = await tx.invoice.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          invoiceNumber: numInfo.formattedNumber,
          docType: 'tax_invoice',
          customerName: customer.name,
          customerPhone: '9999999999',
          totalAmount: 10000,
          balanceDue: 10000,
          paymentStatus: 'unpaid',
        },
      });

      await tx.ledgerEntry.create({
        data: {
          tenantId: tenant.id,
          partyType: 'customer',
          partyId: customer.id,
          entryDate: new Date(),
          financialYear: fy,
          voucherType: 'sales',
          voucherNo: doc.invoiceNumber,
          particulars: `Sales Tax Invoice #${doc.invoiceNumber}`,
          debit: new Prisma.Decimal('10000.00'),
          credit: new Prisma.Decimal('0.00'),
          sourceType: 'invoice',
          sourceId: doc.id,
        },
      });

      return doc;
    });

    // 10 concurrent payments of 1,000 each
    const parallelPayments = Array.from({ length: 10 }).map((_, idx) => {
      return prisma.$transaction(async (tx) => {
        // Lock invoice row FOR UPDATE
        const rows = await tx.$queryRaw`
          SELECT "id", "balanceDue", "totalAmount"
          FROM "Invoice"
          WHERE "id" = ${targetInvoice.id}
          FOR UPDATE
        `;
        const currentInv = rows[0];
        const newBalance = Math.max(0, Number((Number(currentInv.balanceDue) - 1000).toFixed(2)));
        const newStatus = newBalance <= 0.01 ? 'paid' : 'partial';

        const receiptInfo = await getNextDocumentNumberTx(tx, tenant.id, 'receipt', 'REC');

        const payRecord = await tx.paymentRecord.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            invoiceId: targetInvoice.id,
            amount: 1000,
            paymentType: 'partial',
            paymentMethod: 'NEFT',
            transactionRef: receiptInfo.formattedNumber,
            paymentDate: new Date(),
          },
        });

        await tx.paymentAllocation.create({
          data: {
            tenantId: tenant.id,
            paymentType: 'customer_receipt',
            paymentRecordId: payRecord.id,
            invoiceId: targetInvoice.id,
            amount: new Prisma.Decimal('1000.00'),
          },
        });

        await tx.invoice.update({
          where: { id: targetInvoice.id },
          data: {
            balanceDue: newBalance,
            paymentStatus: newStatus,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            tenantId: tenant.id,
            partyType: 'customer',
            partyId: customer.id,
            entryDate: new Date(),
            financialYear: fy,
            voucherType: 'receipt',
            voucherNo: receiptInfo.formattedNumber,
            particulars: `Receipt #${receiptInfo.formattedNumber}`,
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal('1000.00'),
            sourceType: 'payment',
            sourceId: payRecord.id,
          },
        });

        return { receiptNumber: receiptInfo.formattedNumber, newBalance };
      });
    });

    const paymentResults = await Promise.all(parallelPayments);
    assert.strictEqual(paymentResults.length, 10);

    const freshInv = await prisma.invoice.findUnique({ where: { id: targetInvoice.id } });
    assert.strictEqual(Number(freshInv.balanceDue), 0.00, 'Invoice balance is exactly 0.00');
    assert.strictEqual(freshInv.paymentStatus, 'paid', 'Invoice is marked paid');

    const totalAllocations = await prisma.paymentAllocation.aggregate({
      where: { invoiceId: targetInvoice.id },
      _sum: { amount: true },
    });
    assert.strictEqual(Number(totalAllocations._sum.amount), 10000, 'Sum of allocations is exactly 10,000.00');

    const receipts = paymentResults.map((p) => p.receiptNumber);
    const uniqueReceipts = new Set(receipts);
    assert.strictEqual(uniqueReceipts.size, 10, 'All 10 receipts have unique receipt numbers');
  });

  // ─── RECONCILIATION CHECK ─────────────────────────────────────────────────

  await test('Reconciliation Check: Reports orphan entries, documents without ledger entries, number gaps', async () => {
    // We run the full reconciliation logic on our test tenant
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, voucherNo: true, voucherType: true, sourceType: true, sourceId: true },
    });

    const invoiceIds = new Set(
      (await prisma.invoice.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map((i) => i.id)
    );
    const paymentIds = new Set(
      (await prisma.paymentRecord.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map((p) => p.id)
    );
    const billIds = new Set(
      (await prisma.purchaseBill.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map((b) => b.id)
    );

    const orphanEntries = [];
    for (const entry of ledgerEntries) {
      if (entry.sourceType === 'invoice' && entry.sourceId && !invoiceIds.has(entry.sourceId)) {
        orphanEntries.push(entry);
      } else if (entry.sourceType === 'payment' && entry.sourceId && !paymentIds.has(entry.sourceId)) {
        orphanEntries.push(entry);
      } else if (entry.sourceType === 'purchase_bill' && entry.sourceId && !billIds.has(entry.sourceId)) {
        orphanEntries.push(entry);
      }
    }

    const postedInvoices = await prisma.invoice.findMany({
      where: { tenantId: tenant.id, isVoided: false, docType: { in: ['tax_invoice', 'sez_invoice', 'credit_note'] } },
      select: { id: true, invoiceNumber: true },
    });
    const invoiceLedgerSourceIds = new Set(
      ledgerEntries.filter((e) => e.sourceType === 'invoice' && e.sourceId).map((e) => e.sourceId)
    );
    const documentsWithoutLedger = postedInvoices.filter((inv) => !invoiceLedgerSourceIds.has(inv.id));

    // Number Gaps
    const seriesList = await prisma.documentSeries.findMany({ where: { tenantId: tenant.id } });
    const numberGaps = [];
    for (const series of seriesList) {
      if (['tax_invoice', 'receipt'].includes(series.docType)) {
        let docs = [];
        if (series.docType === 'tax_invoice') {
          docs = await prisma.invoice.findMany({ where: { tenantId: tenant.id, docType: series.docType }, select: { invoiceNumber: true } });
        } else {
          docs = await prisma.paymentRecord.findMany({ where: { tenantId: tenant.id }, select: { transactionRef: true } });
        }
        const nums = docs
          .map((d) => {
            const val = d.invoiceNumber || d.transactionRef;
            const parts = (val || '').split('/');
            return parseInt(parts[parts.length - 1], 10);
          })
          .filter((n) => !isNaN(n))
          .sort((a, b) => a - b);

        if (nums.length > 0) {
          const max = Math.max(...nums);
          const present = new Set(nums);
          const missing = [];
          for (let i = 1; i <= max; i++) {
            if (!present.has(i)) missing.push(i);
          }
          if (missing.length > 0) {
            numberGaps.push({ docType: series.docType, missing });
          }
        }
      }
    }

    console.log(`\n    Reconciliation Report:`);
    console.log(`    - Total Ledger Entries Checked: ${ledgerEntries.length}`);
    console.log(`    - Orphan Ledger Entries: ${orphanEntries.length}`);
    console.log(`    - Documents Without Ledger Entries: ${documentsWithoutLedger.length}`);
    console.log(`    - Sequence Number Gaps: ${numberGaps.length}`);

    assert.strictEqual(orphanEntries.length, 0, 'Zero orphan ledger entries');
    assert.strictEqual(documentsWithoutLedger.length, 0, 'Zero documents without ledger entries');
    assert.strictEqual(numberGaps.length, 0, 'Zero sequence number gaps');
  });

  // Clean up test tenant
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`\n[TEARDOWN] Cleaned up Test Tenant ${testTenantCode}`);

  console.log('================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================');

  await prisma.$disconnect();
}

runStep1MoneySafetySuite().catch(async (e) => {
  console.error('FATAL TEST ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
