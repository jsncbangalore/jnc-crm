import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

async function main() {
  console.log('=== Step 1: Database Inspection on jnc_crm_dev ===');

  // Find or create test tenant with complete branding & GST, but no Tenant bank fields
  let testTenant = await prisma.tenant.findFirst({
    where: { code: 'TEST_REPRO_BUG' },
  });

  if (!testTenant) {
    testTenant = await prisma.tenant.create({
      data: {
        code: 'TEST_REPRO_BUG',
        slug: 'test-repro-bug',
        name: 'Repro Test Company Pvt Ltd',
        address: '123 Tech Park, Whitefield, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankBranch: null,
        isOnboarded: true,
      },
    });
  } else {
    // Ensure Tenant table bank fields are empty
    testTenant = await prisma.tenant.update({
      where: { id: testTenant.id },
      data: {
        name: 'Repro Test Company Pvt Ltd',
        address: '123 Tech Park, Whitefield, Bengaluru',
        gstin: '29ABCDE1234F1Z5',
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankBranch: null,
      },
    });
  }

  // Ensure CompanyBankAccount has an active account with isDocumentDefault
  let bankAccount = await prisma.companyBankAccount.findFirst({
    where: { tenantId: testTenant.id },
  });

  if (!bankAccount) {
    bankAccount = await prisma.companyBankAccount.create({
      data: {
        tenantId: testTenant.id,
        label: 'Corporate Current Account',
        bankName: 'HDFC Bank',
        holderName: 'Repro Test Company Pvt Ltd',
        accountNumber: 'ENC_TEST_ACC_123456789012',
        accountNumberLast4: '9012',
        ifsc: 'HDFC0001234',
        branch: 'Whitefield',
        isDefault: true,
        isDocumentDefault: true,
        isActive: true,
      },
    });
  } else {
    bankAccount = await prisma.companyBankAccount.update({
      where: { id: bankAccount.id },
      data: {
        bankName: 'HDFC Bank',
        accountNumberLast4: '9012',
        ifsc: 'HDFC0001234',
        isDefault: true,
        isDocumentDefault: true,
        isActive: true,
      },
    });
  }

  // Display Tenant row fields (only whether bankAccountNumber is empty or set, never value)
  console.log('\n--- Tenant Row Fields for Test Company ---');
  console.log({
    id: testTenant.id,
    name: testTenant.name,
    address: testTenant.address,
    gstin: testTenant.gstin,
    bankName: testTenant.bankName,
    bankIfsc: testTenant.bankIfsc,
    bankAccountNumber: testTenant.bankAccountNumber ? 'SET' : 'EMPTY',
  });

  // Display CompanyBankAccount rows (masked)
  const bankAccounts = await prisma.companyBankAccount.findMany({
    where: { tenantId: testTenant.id },
    select: {
      id: true,
      tenantId: true,
      label: true,
      bankName: true,
      accountNumberLast4: true,
      ifsc: true,
      isDefault: true,
      isDocumentDefault: true,
      isActive: true,
    },
  });

  console.log('\n--- CompanyBankAccount Rows (Masked) ---');
  console.log(
    bankAccounts.map((b) => ({
      id: b.id,
      bankName: b.bankName,
      maskedAccount: `••••${b.accountNumberLast4}`,
      ifsc: b.ifsc,
      isDefault: b.isDefault,
      isDocumentDefault: b.isDocumentDefault,
      isActive: b.isActive,
    }))
  );

  // Reproduce the check from invoicing.service.ts lines 328-343
  console.log('\n--- Evaluating Document Creation Server Check (invoicing.service.ts lines 328-343) ---');
  const missingFields: string[] = [];
  if (!testTenant.name?.trim()) missingFields.push('Company Name');
  if (!testTenant.address?.trim()) missingFields.push('Address');
  if (!testTenant.gstin?.trim()) missingFields.push('GSTIN');
  if (!testTenant.bankName?.trim() || !testTenant.bankAccountNumber?.trim() || !testTenant.bankIfsc?.trim()) {
    missingFields.push('Bank Details (Bank Name, Account Number, IFSC)');
  }

  console.log('Missing fields evaluated by old check:', missingFields);
  if (missingFields.length > 0) {
    console.log(`\n[REPRODUCED BUG]: The server rejects document creation with:`);
    console.log(
      `"Cannot create invoice. Company profile in Settings is incomplete. Missing: ${missingFields.join(', ')}."`
    );
  }

  console.log('\n--- One-Sentence Root Cause ---');
  console.log(
    'Root Cause: The document creation check in invoicing.service.ts strictly validates only the legacy Tenant table columns (bankName, bankAccountNumber, bankIfsc) and ignores the new CompanyBankAccount table where active document-settlement accounts are now stored.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
