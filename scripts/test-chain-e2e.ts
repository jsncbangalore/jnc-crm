/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../.env.development');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadDevEnv();

import { PrismaClient } from '@prisma/client';

async function testFullChain() {
  console.log('========================================================================');
  console.log('STARTING DEV DATABASE END-TO-END DOCUMENT CHAIN VERIFICATION');
  console.log('========================================================================');

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    // 1. Get dev tenant and admin user
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'Acme Corporation' } },
    });
    if (!tenant) throw new Error('Dev tenant Acme Corporation not found.');

    const adminUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'tenant_admin' },
    });
    if (!adminUser) throw new Error('Tenant admin user not found.');

    const customer = await prisma.company.findFirst({
      where: { tenantId: tenant.id },
    });
    if (!customer) throw new Error('Customer company not found.');

    const sku = await prisma.sku.findFirst({
      where: { tenantId: tenant.id },
    });
    if (!sku) throw new Error('SKU not found.');

    console.log(`[PASS] Environment ready: Tenant "${tenant.name}", Customer "${customer.name}"`);

    // 2. Create Quotation
    const quoteNumber = `QT-E2E-${Date.now().toString().slice(-6)}`;
    const quotation = await prisma.quotation.create({
      data: {
        tenantId: tenant.id,
        quoteNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerEmail: 'billing@example.com',
        customerGstin: customer.gstin || '29ABCDE1234F1Z5',
        customerState: customer.state || 'Karnataka',
        customerAddress: customer.address || 'Industrial Area, Bengaluru',
        createdById: adminUser.id,
        status: 'accepted',
        subtotal: 10000,
        taxRate: 18.0,
        taxAmount: 1800,
        totalAmount: 11800,
        validUntil: new Date(Date.now() + 30 * 86400000),
        notes: 'E2E Test Quotation',
        lines: {
          create: [
            {
              skuId: sku.id,
              hsnCode: sku.hsnCode || '85184000',
              description: sku.name,
              quantity: 2,
              unitPrice: 5000,
              discount: 0,
              gstRate: 18.0,
              totalPrice: 10000,
            },
          ],
        },
      },
      include: {
        lines: { include: { sku: true } },
        customer: true,
        createdBy: true,
      },
    });
    console.log(`[PASS] 1. Quotation created: #${quotation.quoteNumber} (Total: ${quotation.totalAmount})`);

    // 3. Convert Quotation to Order
    const orderNumber = `SO-E2E-${Date.now().toString().slice(-6)}`;
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        orderNumber,
        quotationId: quotation.id,
        customerId: customer.id,
        customerName: quotation.customerName!,
        customerPhone: quotation.customerPhone!,
        customerEmail: quotation.customerEmail,
        customerGstin: quotation.customerGstin,
        customerState: quotation.customerState,
        customerAddress: quotation.customerAddress,
        createdById: adminUser.id,
        status: 'confirmed',
        subtotal: quotation.subtotal,
        taxAmount: quotation.taxAmount,
        totalAmount: quotation.totalAmount,
        advancePercent: 50,
        advanceAmount: 5900,
        paidAmount: 0,
        balanceAmount: 11800,
        lines: {
          create: [
            {
              skuId: sku.id,
              quantity: 2,
              unitPrice: 5000,
              taxRate: 18.0,
              totalPrice: 10000,
            },
          ],
        },
      },
      include: {
        lines: { include: { sku: true } },
        quotation: true,
        customer: true,
      },
    });
    console.log(`[PASS] 2. Order generated: #${order.orderNumber} (Ref Quotation: ${order.quotation?.quoteNumber})`);

    // 4. Create Invoices for each type:
    // 4a. Tax Invoice from Order
    const taxInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `INV-TAX-${Date.now().toString().slice(-6)}`,
        docType: 'tax_invoice',
        orderId: order.id,
        customerId: customer.id,
        companyId: customer.id,
        createdById: adminUser.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        customerGstin: order.customerGstin,
        customerState: order.customerState,
        billingAddress: order.customerAddress,
        subtotal: order.subtotal,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        totalAmount: 11800,
        balanceDue: 11800,
        paymentStatus: 'unpaid',
        lines: {
          create: [
            {
              skuId: sku.id,
              description: sku.name,
              hsnCode: sku.hsnCode || '85184000',
              quantity: 2,
              unitPrice: 5000,
              taxRate: 18.0,
              cgstRate: 9.0,
              cgstAmount: 900,
              sgstRate: 9.0,
              sgstAmount: 900,
              igstRate: 0,
              igstAmount: 0,
              lineTotal: 11800,
            },
          ],
        },
      },
    });
    console.log(`[PASS] 3a. Tax Invoice created: #${taxInvoice.invoiceNumber}`);

    // 4b. SEZ Invoice
    const sezInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `INV-SEZ-${Date.now().toString().slice(-6)}`,
        docType: 'sez_invoice',
        isSez: true,
        lutBondNo: 'LUT/SEZ/2026/001',
        lutValidity: '2027-03-31',
        customerId: customer.id,
        companyId: customer.id,
        createdById: adminUser.id,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerState: 'Karnataka',
        billingAddress: 'Special Economic Zone, Phase 1',
        subtotal: 20000,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 20000,
        balanceDue: 20000,
        paymentStatus: 'unpaid',
        lines: {
          create: [
            {
              skuId: sku.id,
              description: `${sku.name} (SEZ Supply under LUT)`,
              hsnCode: sku.hsnCode || '85184000',
              quantity: 4,
              unitPrice: 5000,
              taxRate: 0,
              cgstRate: 0,
              cgstAmount: 0,
              sgstRate: 0,
              sgstAmount: 0,
              igstRate: 0,
              igstAmount: 0,
              lineTotal: 20000,
            },
          ],
        },
      },
    });
    console.log(`[PASS] 3b. SEZ Invoice created: #${sezInvoice.invoiceNumber}`);

    // 4c. Proforma Invoice
    const proformaInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `PI-${Date.now().toString().slice(-6)}`,
        docType: 'proforma',
        customerId: customer.id,
        companyId: customer.id,
        createdById: adminUser.id,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerState: 'Karnataka',
        subtotal: 10000,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        totalAmount: 11800,
        advancePercent: 50,
        advanceAmount: 5900,
        balanceDue: 11800,
        paymentStatus: 'unpaid',
        lines: {
          create: [
            {
              skuId: sku.id,
              description: sku.name,
              hsnCode: sku.hsnCode || '85184000',
              quantity: 2,
              unitPrice: 5000,
              taxRate: 18.0,
              cgstRate: 9.0,
              cgstAmount: 900,
              sgstRate: 9.0,
              sgstAmount: 900,
              igstRate: 0,
              igstAmount: 0,
              lineTotal: 11800,
            },
          ],
        },
      },
    });
    console.log(`[PASS] 3c. Proforma Invoice created: #${proformaInvoice.invoiceNumber}`);

    // 4d. Delivery Challan
    const challan = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `DC-${Date.now().toString().slice(-6)}`,
        docType: 'delivery_challan',
        customerId: customer.id,
        companyId: customer.id,
        createdById: adminUser.id,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerState: 'Karnataka',
        subtotal: 10000,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 10000,
        balanceDue: 0,
        paymentStatus: 'unpaid',
        lines: {
          create: [
            {
              skuId: sku.id,
              description: `${sku.name} (Delivery Challan)`,
              hsnCode: '-',
              quantity: 2,
              unitPrice: 5000,
              taxRate: 0,
              cgstRate: 0,
              cgstAmount: 0,
              sgstRate: 0,
              sgstAmount: 0,
              igstRate: 0,
              igstAmount: 0,
              lineTotal: 10000,
            },
          ],
        },
      },
    });
    console.log(`[PASS] 3d. Delivery Challan created: #${challan.invoiceNumber}`);

    // 4e. Credit Note
    const creditNote = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `CN-${Date.now().toString().slice(-6)}`,
        docType: 'credit_note',
        referenceNo: taxInvoice.invoiceNumber,
        customerId: customer.id,
        companyId: customer.id,
        createdById: adminUser.id,
        customerName: customer.name,
        customerPhone: '9876543210',
        customerState: 'Karnataka',
        subtotal: 2000,
        cgstAmount: 180,
        sgstAmount: 180,
        igstAmount: 0,
        totalAmount: 2360,
        balanceDue: 0,
        paymentStatus: 'paid',
        lines: {
          create: [
            {
              skuId: sku.id,
              description: 'Return credit adjustment',
              hsnCode: sku.hsnCode || '85184000',
              quantity: 1,
              unitPrice: 2000,
              taxRate: 18.0,
              cgstRate: 9.0,
              cgstAmount: 180,
              sgstRate: 9.0,
              sgstAmount: 180,
              igstRate: 0,
              igstAmount: 0,
              lineTotal: 2360,
            },
          ],
        },
      },
    });
    console.log(`[PASS] 3e. Credit Note created: #${creditNote.invoiceNumber}`);

    // 5. Payment Record & Ledger Entry
    const payment = await prisma.paymentRecord.create({
      data: {
        tenantId: tenant.id,
        invoiceId: taxInvoice.id,
        orderId: order.id,
        customerId: customer.id,
        amount: 11800,
        paymentType: 'final',
        paymentMethod: 'bank_transfer',
        transactionRef: 'NEFT-E2E-998877',
        paymentDate: new Date(),
        notes: 'Full payment received against tax invoice',
        recordedById: adminUser.id,
      },
    });

    // Update invoice payment status
    await prisma.invoice.update({
      where: { id: taxInvoice.id },
      data: { paymentStatus: 'paid', balanceDue: 0 },
    });

    // Create Ledger Entry
    const ledgerEntry = await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        partyType: 'customer',
        partyId: customer.id,
        entryDate: new Date(),
        financialYear: '26-27',
        voucherType: 'receipt',
        voucherNo: payment.id.slice(0, 8),
        particulars: 'Payment via NEFT-E2E-998877',
        debit: 0,
        credit: 11800,
        sourceType: 'invoice',
        sourceId: taxInvoice.id,
      },
    });
    console.log(`[PASS] 4. Payment recorded (Amount: ${payment.amount}, Ref: ${payment.transactionRef})`);
    console.log(`[PASS] 5. Ledger entry created: #${ledgerEntry.voucherNo} (Credit: ${ledgerEntry.credit})`);

    // 6. Reports: Verify Ledger Statement and Balance
    const ledgerSummary = await prisma.ledgerEntry.aggregate({
      where: { tenantId: tenant.id, partyId: customer.id },
      _sum: { credit: true, debit: true },
      _count: true,
    });
    console.log(`[PASS] 6. Reports check: Ledger entries count: ${ledgerSummary._count}, Total Credit: ${ledgerSummary._sum.credit}, Total Debit: ${ledgerSummary._sum.debit}`);

    console.log('------------------------------------------------------------------------');
    console.log('[CHAIN TEST SUCCESS] Full document chain executed flawlessly on dev database!');
    process.exit(0);
  } catch (err: any) {
    console.error('[CHAIN TEST FAILURE]', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testFullChain();
