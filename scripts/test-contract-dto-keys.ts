import 'reflect-metadata';
import { validateSync, getMetadataStorage } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as fs from 'fs';
import * as path from 'path';

import { RecordPaymentDto } from '../apps/api/src/payments/dto/payment.dto';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../apps/api/src/settings/dto/bank-account.dto';
import { CreateDirectInvoiceDto, UpdateInvoiceDto } from '../apps/api/src/invoicing/dto/invoicing.dto';

interface ContractCheckResult {
  name: string;
  passed: boolean;
  webKeys: string[];
  dtoKeys: string[];
  extraKeys: string[];
  validationErrors?: any[];
}

function getDtoAllowedKeys(targetClass: any): string[] {
  const keys = new Set<string>();

  // 1. Official class-validator metadata storage
  const storage = getMetadataStorage();
  const metadatas = storage.getTargetValidationMetadatas(targetClass, '', false, false);
  for (const m of metadatas) {
    if (m.propertyName) keys.add(m.propertyName);
  }

  // 2. Class instance properties
  try {
    const dummy = new targetClass();
    for (const k of Object.keys(dummy)) {
      keys.add(k);
    }
  } catch {
    // ignore
  }

  return Array.from(keys);
}

export const CANONICAL_RECEIPT_KEYS = [
  'partyType',
  'partyId',
  'customerId',
  'supplierId',
  'orderId',
  'amount',
  'paymentDate',
  'paymentMethod',
  'reference',
  'bankAccountId',
  'notes',
  'isAdvance',
  'allowAdvance',
  'confirmDuplicate',
  'confirmedLargePayment',
  'typedConfirmation',
  'allocations',
  'idempotencyKey',
];

export const FORBIDDEN_RECEIPT_ALIASES = [
  'referenceNumber',
  'transactionRef',
  'bankAccount',
  'narration',
];

function runCanonicalReceiptCheck(
  name: string,
  webPayload: Record<string, any>
): ContractCheckResult {
  const allowedKeys = new Set(CANONICAL_RECEIPT_KEYS);
  const webKeys = Object.keys(webPayload);
  const extraKeys = webKeys.filter((k) => !allowedKeys.has(k));
  const forbiddenAliasesPresent = webKeys.filter((k) => FORBIDDEN_RECEIPT_ALIASES.includes(k));

  // Also validate against RecordPaymentDto with forbidNonWhitelisted: true
  const instance = plainToInstance(RecordPaymentDto, webPayload);
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const passed = extraKeys.length === 0 && forbiddenAliasesPresent.length === 0 && errors.length === 0;

  return {
    name,
    passed,
    webKeys,
    dtoKeys: CANONICAL_RECEIPT_KEYS,
    extraKeys: Array.from(new Set([...extraKeys, ...forbiddenAliasesPresent])),
    validationErrors: errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    })),
  };
}

function runContractCheck(
  name: string,
  dtoClass: any,
  webPayload: Record<string, any>
): ContractCheckResult {
  const allowedKeys = new Set(getDtoAllowedKeys(dtoClass));
  const webKeys = Object.keys(webPayload);
  const extraKeys = webKeys.filter((k) => !allowedKeys.has(k));

  // Run class-validator validation with forbidUnknownValues and whitelist check
  const instance = plainToInstance(dtoClass, webPayload);
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const passed = extraKeys.length === 0 && errors.length === 0;

  return {
    name,
    passed,
    webKeys,
    dtoKeys: Array.from(allowedKeys),
    extraKeys,
    validationErrors: errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    })),
  };
}

async function main() {
  console.log('====================================================');
  console.log('RUNNING DTO CONTRACT KEYS COMPATIBILITY TEST SUITE');
  console.log('Comparing keys sent by Web against API DTO definitions');
  console.log('====================================================\n');

  // 1. Receipt / Customer Payment payload (UnifiedRecordPaymentModal.tsx)
  const receiptWebPayload = {
    partyType: 'customer',
    partyId: 'cust-uuid-1234',
    customerId: 'cust-uuid-1234',
    supplierId: undefined,
    orderId: undefined,
    amount: 5000,
    paymentDate: '2026-11-05',
    paymentMethod: 'NEFT',
    reference: 'NEFT12345678',
    bankAccountId: 'ba-uuid-1234',
    notes: 'Advance receipt for project',
    isAdvance: true,
    allowAdvance: true,
    confirmDuplicate: false,
    confirmedLargePayment: false,
    typedConfirmation: undefined,
    allocations: undefined,
    idempotencyKey: 'idem-12345',
  };

  // 2. Supplier Payment payload (UnifiedRecordPaymentModal.tsx)
  const paymentWebPayload = {
    partyType: 'supplier',
    partyId: 'supp-uuid-5678',
    customerId: undefined,
    supplierId: 'supp-uuid-5678',
    orderId: undefined,
    amount: 15000,
    paymentDate: '2026-11-05',
    paymentMethod: 'RTGS',
    reference: 'RTGS98765432',
    bankAccountId: 'ba-uuid-5678',
    notes: 'Vendor bill payment',
    isAdvance: false,
    allowAdvance: false,
    confirmDuplicate: false,
    confirmedLargePayment: false,
    typedConfirmation: undefined,
    allocations: undefined,
    idempotencyKey: 'idem-67890',
  };

  // 3. Bank Account Create payload (CompanyBankAccountsSection.tsx)
  const bankAccountCreatePayload = {
    label: 'Main Current Account',
    bankName: 'HDFC Bank',
    holderName: 'JNC Operations Pvt Ltd',
    accountNumber: '50200012345678',
    ifsc: 'HDFC0001234',
    branch: 'Indiranagar',
    upiId: 'jnc@hdfcbank',
    isDefault: true,
    isDocumentDefault: true,
  };

  // 4. Bank Account Update payload (CompanyBankAccountsSection.tsx)
  const bankAccountUpdatePayload = {
    label: 'Primary Current Account',
    bankName: 'HDFC Bank Ltd',
    holderName: 'JNC Operations Pvt Ltd',
    accountNumber: '50200012345678',
    ifsc: 'HDFC0001234',
    branch: 'Indiranagar Bangalore',
    upiId: 'jnc@hdfcbank',
    isDefault: true,
    isDocumentDefault: true,
    isActive: true,
  };

  // 5. Create Direct Invoice payload (CreateDocumentModal.tsx)
  const invoiceCreatePayload = {
    docType: 'tax_invoice',
    invoiceNumber: 'INV-PD/26-27/0001',
    invoiceDate: '2026-11-05',
    dueDate: '2026-11-20',
    poDate: undefined,
    buyerOrderNo: 'PO-9912',
    referenceNo: 'REF-1001',
    paymentTerms: 'Due on Receipt',
    paymentStatus: 'unpaid',
    deliverySchedule: undefined,
    customerId: 'cust-uuid-1234',
    customerName: 'Test Party',
    customerPhone: '+919876543210',
    customerEmail: 'billing@testparty.com',
    customerGstin: '29AAAAA0000A1ZY',
    customerState: 'Karnataka',
    billingAddress: 'Bangalore, Karnataka, India',
    deliveryAddress: 'Bangalore, Karnataka, India',
    lutBondNo: undefined,
    lutValidity: undefined,
    lutAcknowledged: undefined,
    isSez: false,
    sezType: undefined,
    advancePercent: undefined,
    advanceAdjusted: undefined,
    balanceDue: undefined,
    transactionRef: undefined,
    notes: 'Standard invoice notes',
    lines: [
      {
        skuId: undefined,
        hsnCode: '85312000',
        description: 'Electronic LED display unit',
        unit: 'Nos',
        quantity: 2,
        unitPrice: 2500,
        taxRate: 18,
      },
    ],
  };

  // 6. Update Invoice payload (CreateDocumentModal.tsx)
  const invoiceUpdatePayload = {
    docType: 'tax_invoice',
    invoiceNumber: 'INV-PD/26-27/0001',
    invoiceDate: '2026-11-05',
    dueDate: '2026-11-20',
    poDate: undefined,
    buyerOrderNo: 'PO-9912',
    referenceNo: 'REF-1001',
    paymentTerms: 'Due on Receipt',
    paymentStatus: 'unpaid',
    deliverySchedule: undefined,
    customerName: 'Test Party Updated',
    customerPhone: '+919876543210',
    customerEmail: 'billing@testparty.com',
    customerGstin: '29AAAAA0000A1ZY',
    customerState: 'Karnataka',
    billingAddress: 'Bangalore, Karnataka, India',
    deliveryAddress: 'Bangalore, Karnataka, India',
    lutBondNo: undefined,
    lutValidity: undefined,
    lutAcknowledged: undefined,
    isSez: false,
    sezType: undefined,
    advancePercent: undefined,
    advanceAdjusted: undefined,
    balanceDue: undefined,
    transactionRef: undefined,
    notes: 'Updated invoice notes',
    lines: [
      {
        skuId: undefined,
        hsnCode: '85312000',
        description: 'Electronic LED display unit',
        unit: 'Nos',
        quantity: 2,
        unitPrice: 2500,
        taxRate: 18,
      },
    ],
  };

  const checks = [
    runCanonicalReceiptCheck('1. Customer Receipt (UnifiedRecordPaymentModal -> Canonical Keys List)', receiptWebPayload),
    runCanonicalReceiptCheck('2. Supplier Payment (UnifiedRecordPaymentModal -> Canonical Keys List)', paymentWebPayload),
    runContractCheck('3. Bank Account Create (CompanyBankAccountsSection -> CreateBankAccountDto)', CreateBankAccountDto, bankAccountCreatePayload),
    runContractCheck('4. Bank Account Update (CompanyBankAccountsSection -> UpdateBankAccountDto)', UpdateBankAccountDto, bankAccountUpdatePayload),
    runContractCheck('5. Direct Invoice Create (CreateDocumentModal -> CreateDirectInvoiceDto)', CreateDirectInvoiceDto, invoiceCreatePayload),
    runContractCheck('6. Invoice Update (CreateDocumentModal -> UpdateInvoiceDto)', UpdateInvoiceDto, invoiceUpdatePayload),
  ];

  let allPassed = true;
  for (const c of checks) {
    if (c.passed) {
      console.log(`[PASS] ${c.name}`);
      console.log(`       Verified ${c.webKeys.length} canonical keys sent by web are fully accepted.`);
    } else {
      allPassed = false;
      console.error(`[FAIL] ${c.name}`);
      if (c.extraKeys.length > 0) {
        console.error(`       Extra/Forbidden keys sent by Web: ${JSON.stringify(c.extraKeys)}`);
      }
      if (c.validationErrors && c.validationErrors.length > 0) {
        console.error(`       Validation errors: ${JSON.stringify(c.validationErrors)}`);
      }
    }
    console.log('');
  }

  // Contract test invariant assertion: Simulated extra unrecognized key MUST be rejected
  console.log('--- Verifying Contract Test Assertion: Extra key MUST fail ---');
  const badReceiptPayload = { ...receiptWebPayload, randomMaliciousKey: 'intruder' };
  const badCheck = runCanonicalReceiptCheck('Negative Test: Extra key rejection', badReceiptPayload);
  if (!badCheck.passed && badCheck.extraKeys.includes('randomMaliciousKey')) {
    console.log('[PASS] Negative Test: Extra unrecognized key "randomMaliciousKey" was correctly identified and rejected.\n');
  } else {
    allPassed = false;
    console.error('[FAIL] Negative Test: Extra key was unexpectedly permitted!\n');
  }

  // Negative Tests: Verify that sending ANY alias ('referenceNumber', 'transactionRef', 'bankAccount', 'narration') FAILS
  console.log('--- Verifying Alias Rejection: All forbidden aliases MUST fail ---');
  for (const alias of FORBIDDEN_RECEIPT_ALIASES) {
    const aliasPayload = { ...receiptWebPayload, [alias]: 'alias_test_value' };
    const aliasCheck = runCanonicalReceiptCheck(`Negative Test: Alias "${alias}" rejection`, aliasPayload);
    if (!aliasCheck.passed && aliasCheck.extraKeys.includes(alias)) {
      console.log(`[PASS] Negative Test: Forbidden alias "${alias}" was correctly detected and rejected.`);
    } else {
      allPassed = false;
      console.error(`[FAIL] Negative Test: Forbidden alias "${alias}" was NOT rejected!`);
    }
  }
  console.log('');

  if (!allPassed) {
    console.error('DTO Contract Test Suite FAILED: Mismatched keys found.');
    process.exit(1);
  } else {
    console.log('ALL DTO CONTRACT CHECKS PASSED SUCCESSFULLY (0 extra keys, 100% compatibility).');
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
