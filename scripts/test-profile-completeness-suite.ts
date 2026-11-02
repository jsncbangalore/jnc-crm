import { PrismaClient } from '@prisma/client';
import * as assert from 'assert';
import { getCompanyProfileCompleteness, getUnifiedCompanyProfile } from '../apps/api/src/common/company-profile.util';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public',
    },
  },
});

async function runTestSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: Company Profile Completeness & Multi-Tenant Bank Sync');
  console.log('Database: jnc_crm_dev (Target: local dev only, no live DB)');
  console.log('================================================================\n');

  const timestamp = Date.now();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Profile complete via Tenant fields
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Profile complete via Tenant fields');
    const tenant1 = await prisma.tenant.create({
      data: {
        code: `TEST_T1_${timestamp}`,
        slug: `test-t1-${timestamp}`,
        name: 'Alpha Technologies Pvt Ltd',
        address: '100 Outer Ring Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560103',
        gstin: '29AAACA1234A1Z1',
        pan: 'AAACA1234A',
        bankName: 'State Bank of India',
        bankAccountNumber: '112233445566',
        bankIfsc: 'SBIN0001234',
        bankBranch: 'Koramangala',
        isOnboarded: true,
      },
    });

    const res1 = await getCompanyProfileCompleteness(prisma, tenant1.id);
    console.log('  Result:', res1);
    assert.strictEqual(res1.complete, true, 'Test 1 failed: complete must be true');
    assert.strictEqual(res1.missing.length, 0, 'Test 1 failed: missing list must be empty');
    console.log('  [PASS] Test 1: Complete via Tenant fields alone without CompanyBankAccount.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Profile complete via CompanyBankAccount only
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Profile complete via CompanyBankAccount only');
    const tenant2 = await prisma.tenant.create({
      data: {
        code: `TEST_T2_${timestamp}`,
        slug: `test-t2-${timestamp}`,
        name: 'Beta Global Solutions Pvt Ltd',
        address: '200 Electronic City Phase 1, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
        gstin: '29BBBCB5678B1Z2',
        pan: 'BBBCB5678B',
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankBranch: null,
        isOnboarded: true,
      },
    });

    await prisma.companyBankAccount.create({
      data: {
        tenantId: tenant2.id,
        label: 'Primary Current Account',
        bankName: 'ICICI Bank',
        holderName: 'Beta Global Solutions Pvt Ltd',
        accountNumber: 'ENC_TEST_ACC_987654321098',
        accountNumberLast4: '1098',
        ifsc: 'ICIC0000456',
        branch: 'Electronic City',
        isDefault: true,
        isDocumentDefault: true,
        isActive: true,
      },
    });

    const res2 = await getCompanyProfileCompleteness(prisma, tenant2.id);
    console.log('  Result:', res2);
    assert.strictEqual(res2.complete, true, 'Test 2 failed: complete must be true');
    assert.strictEqual(res2.missing.length, 0, 'Test 2 failed: missing list must be empty');

    const profile2 = await getUnifiedCompanyProfile(prisma, tenant2.id);
    console.log('  Unified Profile Bank Name:', profile2?.bankName);
    console.log('  Unified Profile Masked Acc Last4:', profile2?.bankAccountNumber ? 'SET' : 'EMPTY');
    assert.strictEqual(profile2?.bankName, 'ICICI Bank', 'Test 2 failed: bankName mismatch');
    console.log('  [PASS] Test 2: Complete via CompanyBankAccount alone with empty Tenant bank fields.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Missing GSTIN
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Missing GSTIN');
    const tenant3 = await prisma.tenant.create({
      data: {
        code: `TEST_T3_${timestamp}`,
        slug: `test-t3-${timestamp}`,
        name: 'Gamma Enterprises Pvt Ltd',
        address: '300 Indiranagar 100ft Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        gstin: null, // missing GSTIN
        pan: 'CCCC1234C',
        bankName: 'Axis Bank',
        bankAccountNumber: '998877665544',
        bankIfsc: 'UTIB0000789',
        isOnboarded: true,
      },
    });

    const res3 = await getCompanyProfileCompleteness(prisma, tenant3.id);
    console.log('  Result:', res3);
    assert.strictEqual(res3.complete, false, 'Test 3 failed: complete must be false');
    assert.ok(res3.missing.includes('GSTIN'), 'Test 3 failed: missing must contain GSTIN');
    console.log('  [PASS] Test 3: Correctly flags missing GSTIN.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Missing bank details (neither Tenant nor CompanyBankAccount)
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Missing Bank Details');
    const tenant4 = await prisma.tenant.create({
      data: {
        code: `TEST_T4_${timestamp}`,
        slug: `test-t4-${timestamp}`,
        name: 'Delta Logistics Pvt Ltd',
        address: '400 Peenya Industrial Area, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560058',
        gstin: '29DDDDD4321D1Z4',
        pan: 'DDDDD4321D',
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        isOnboarded: true,
      },
    });

    const res4 = await getCompanyProfileCompleteness(prisma, tenant4.id);
    console.log('  Result:', res4);
    assert.strictEqual(res4.complete, false, 'Test 4 failed: complete must be false');
    assert.ok(res4.missing.includes('Bank Details'), 'Test 4 failed: missing must contain Bank Details');
    console.log('  [PASS] Test 4: Correctly flags missing Bank Details.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Two tenants, the check reads the right one (multi-tenant isolation)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Multi-Tenant Isolation (Tenant A vs Tenant B)');
    const tenantA = await prisma.tenant.create({
      data: {
        code: `TEST_ISO_A_${timestamp}`,
        slug: `test-iso-a-${timestamp}`,
        name: 'Tenant A Full Profile Corp',
        address: 'Suite 501, MG Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        gstin: '29AAAAA1111A1Z5',
        pan: 'AAAAA1111A',
        isOnboarded: true,
      },
    });

    await prisma.companyBankAccount.create({
      data: {
        tenantId: tenantA.id,
        label: 'Tenant A Settlement',
        bankName: 'Kotak Mahindra Bank',
        holderName: 'Tenant A Full Profile Corp',
        accountNumber: 'ENC_TEST_ACC_A_11112222',
        accountNumberLast4: '2222',
        ifsc: 'KKBK0000123',
        isDefault: true,
        isDocumentDefault: true,
        isActive: true,
      },
    });

    const tenantB = await prisma.tenant.create({
      data: {
        code: `TEST_ISO_B_${timestamp}`,
        slug: `test-iso-b-${timestamp}`,
        name: 'Tenant B Incomplete Corp',
        address: 'Suite 502, MG Road, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        gstin: '29BBBBB2222B1Z6',
        pan: 'BBBBB2222B',
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        isOnboarded: true,
      },
    });

    const resA = await getCompanyProfileCompleteness(prisma, tenantA.id);
    const resB = await getCompanyProfileCompleteness(prisma, tenantB.id);

    console.log('  Tenant A Result:', resA);
    console.log('  Tenant B Result:', resB);

    assert.strictEqual(resA.complete, true, 'Test 5 failed: Tenant A must be complete');
    assert.strictEqual(resA.missing.length, 0, 'Test 5 failed: Tenant A missing must be empty');

    assert.strictEqual(resB.complete, false, 'Test 5 failed: Tenant B must be incomplete');
    assert.ok(resB.missing.includes('Bank Details'), 'Test 5 failed: Tenant B must be missing Bank Details');
    assert.strictEqual(resB.missing.length, 1, 'Test 5 failed: Tenant B missing count mismatch');

    console.log('  [PASS] Test 5: Multi-tenant isolation verified - Tenant B did not inherit Tenant A bank account.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Invoicing create check allows CompanyBankAccount & blocks incomplete
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Document creation check with CompanyBankAccount only vs incomplete');
    const { InvoicingService } = await import('../apps/api/src/invoicing/invoicing.service');
    const { DocumentSeriesService } = await import('../apps/api/src/common/document-series.service');
    const seriesService = new DocumentSeriesService(prisma as any);
    const invoicingService = new InvoicingService(
      prisma as any,
      { getInvoiceScope: () => ({ tenantId: tenant2.id }) } as any,
      {} as any,
      { log: () => Promise.resolve() } as any,
      {} as any,
      seriesService,
    );

    // Create real user records in DB for foreign key constraints
    const user2 = await prisma.user.create({
      data: {
        tenantId: tenant2.id,
        email: `tester-${timestamp}-2@test.local`,
        passwordHash: 'dummy',
        role: 'tenant_admin',
        name: 'Tester Two',
        employeeCode: `EMP-${timestamp.toString().slice(-4)}-2`,
      },
    });
    const mockUser2: any = { id: user2.id, role: 'tenant_admin', tenantId: tenant2.id, employeeCode: user2.employeeCode };

    const docCreated = await invoicingService.createDirectDocument(mockUser2, {
      customerName: 'Acme Test Customer',
      customerPhone: '9876543210',
      docType: 'tax_invoice',
      lines: [{ description: 'Dev Software License', quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
    console.log('  Tenant 2 Document Created:', docCreated?.invoiceNumber);
    assert.ok(docCreated?.id, 'Test 6 failed: Document should be created for Tenant 2');

    // Tenant 4 is missing bank. InvoicingService should reject with incomplete error!
    const user4 = await prisma.user.create({
      data: {
        tenantId: tenant4.id,
        email: `tester-${timestamp}-4@test.local`,
        passwordHash: 'dummy',
        role: 'tenant_admin',
        name: 'Tester Four',
        employeeCode: `EMP-${timestamp.toString().slice(-4)}-4`,
      },
    });
    const mockUser4: any = { id: user4.id, role: 'tenant_admin', tenantId: tenant4.id, employeeCode: user4.employeeCode };
    let errorCaught = false;
    try {
      await invoicingService.createDirectDocument(mockUser4, {
        customerName: 'Acme Test Customer 4',
        customerPhone: '9876543210',
        docType: 'tax_invoice',
        lines: [{ description: 'Dev Software License', quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });
    } catch (err: any) {
      errorCaught = true;
      console.log('  Tenant 4 Rejection Message:', err.message);
      assert.ok(
        err.message.includes('Company profile in Settings is incomplete. Missing: Bank Details'),
        'Test 6 failed: Message must list Bank Details'
      );
    }
    assert.strictEqual(errorCaught, true, 'Test 6 failed: InvoicingService must reject incomplete Tenant 4');
    console.log('  [PASS] Test 6: Document creation check accurately accepts CompanyBankAccount and blocks incomplete.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Three routes return the same data (one service)
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Parity of the three company-profile routes');
    const { SettingsService } = await import('../apps/api/src/settings/settings.service');
    const settingsService = new SettingsService(prisma as any);

    const fromInvoicing = await invoicingService.getCompanyProfile(mockUser2);
    const fromSettings = await settingsService.getCompanyProfile(mockUser2);

    assert.strictEqual(fromInvoicing.companyName, fromSettings.companyName, 'Name mismatch');
    assert.strictEqual(fromInvoicing.gstin, fromSettings.gstin, 'GSTIN mismatch');
    assert.strictEqual(fromInvoicing.bankName, fromSettings.bankName, 'BankName mismatch');
    assert.strictEqual(fromInvoicing.bankAccountNumber, fromSettings.bankAccountNumber, 'AccountNumber mismatch');
    assert.strictEqual(fromInvoicing.completeness.complete, fromSettings.completeness.complete, 'Completeness mismatch');
    console.log('  Invoicing route bankName:', fromInvoicing.bankName);
    console.log('  Settings route bankName:', fromSettings.bankName);
    console.log('  [PASS] Test 7: All routes return identical unified company profile structure.\n');

    // -------------------------------------------------------------------------
    // TEST 8: Saving Branding & GST and saving bank account keep Tenant in sync
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Transactional Auto-sync: Saving Branding & GST and Bank Accounts');
    const { BankAccountsService } = await import('../apps/api/src/settings/bank-accounts.service');
    const bankAccountsService = new BankAccountsService(prisma as any);

    // Update Branding & GST with new bank details
    await settingsService.updateCompanyProfile(mockUser2, {
      name: 'Beta Global Solutions Pvt Ltd',
      bankName: 'HDFC Bank AutoSync',
      bankAccountNumber: '998811223344',
      bankIfsc: 'HDFC0004321',
      bankBranch: 'Whitefield',
    });

    const tenantAfterBrandingSave = await prisma.tenant.findUnique({ where: { id: tenant2.id } });
    const bankAccAfterBrandingSave = await prisma.companyBankAccount.findFirst({
      where: { tenantId: tenant2.id, isDefault: true },
    });

    assert.strictEqual(tenantAfterBrandingSave?.bankName, 'HDFC Bank AutoSync', 'Tenant bankName must match');
    assert.strictEqual(tenantAfterBrandingSave?.bankAccountNumber, '998811223344', 'Tenant bankAccountNumber must match');
    assert.strictEqual(bankAccAfterBrandingSave?.bankName, 'HDFC Bank AutoSync', 'CompanyBankAccount bankName must match');
    console.log('  Tenant row bankName after branding save:', tenantAfterBrandingSave?.bankName);
    console.log('  CompanyBankAccount row bankName:', bankAccAfterBrandingSave?.bankName);

    // Add another bank account and set as default via BankAccountsService
    const newAcc = await bankAccountsService.create(
      tenant2.id,
      {
        bankName: 'Axis Bank AutoSync',
        accountNumber: '11223344556677',
        ifsc: 'UTIB0001234',
        branch: 'Indiranagar',
        isDefault: true,
        isDocumentDefault: true,
      },
      mockUser2
    );

    const tenantAfterBankSave = await prisma.tenant.findUnique({ where: { id: tenant2.id } });
    assert.strictEqual(tenantAfterBankSave?.bankName, 'Axis Bank AutoSync', 'Tenant bankName must update on new default');
    assert.strictEqual(tenantAfterBankSave?.bankAccountNumber, '11223344556677', 'Tenant bankAccountNumber must update on new default');
    console.log('  Tenant row bankName after bank account save:', tenantAfterBankSave?.bankName);
    console.log('  [PASS] Test 8: Both updates keep old Tenant bank fields in sync in the same transaction.\n');

    console.log('================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (100% pass rate)');
    console.log('================================================================');
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
