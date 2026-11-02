import { PrismaClient } from '@prisma/client';
import { BankAccountsService } from '../apps/api/src/settings/bank-accounts.service';
import { SettingsService } from '../apps/api/src/settings/settings.service';
import * as assert from 'assert';

async function main() {
  const prisma = new PrismaClient();
  const bankAccountsService = new BankAccountsService(prisma as any);
  const settingsService = new SettingsService(prisma as any);

  console.log('--- TEST 1: Tenant bank details fallback when companyBankAccount table has 0 rows ---');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Automatic Company Ltd',
      code: 'AUTO-' + Date.now(),
      slug: 'test-auto-' + Date.now(),
      bankName: 'Automatic Bank of India',
      bankAccountNumber: '987654321012',
      bankIfsc: 'AUTO0001234',
      bankBranch: 'Indiranagar',
      bankUpi: 'autocompany@upi',
      status: 'active',
    },
  });

  try {
    const accounts = await bankAccountsService.findAll(tenant.id);
    assert.strictEqual(accounts.length, 1, 'Must return 1 fallback account');
    assert.strictEqual(accounts[0].bankName, 'Automatic Bank of India');
    assert.strictEqual(accounts[0].holderName, 'Test Automatic Company Ltd');
    assert.strictEqual(accounts[0].accountNumberLast4, '1012');
    assert.strictEqual(accounts[0].maskedAccount, '••••1012');
    console.log('✓ Fallback account verified:');
    console.log('  Display Label:', accounts[0].displayLabel);
    console.log('  Holder (Company Account Name):', accounts[0].holderName);
    console.log('  Last 4:', accounts[0].accountNumberLast4);

    console.log('\n--- TEST 2: updateCompanyProfile auto-syncing CompanyBankAccount ---');
    const user = {
      id: 'test-admin-id',
      tenantId: tenant.id,
      role: 'tenant_admin' as const,
      email: 'admin@autocompany.com',
    };

    await settingsService.updateCompanyProfile(user as any, {
      name: 'Test Automatic Company Ltd',
      bankName: 'Synced HDFC Bank',
      bankAccountNumber: '112233445566',
      bankIfsc: 'HDFC0009999',
      bankBranch: 'MG Road',
    });

    const syncedAccounts = await prisma.companyBankAccount.findMany({
      where: { tenantId: tenant.id },
    });
    assert.strictEqual(syncedAccounts.length, 1, 'Must create 1 synced companyBankAccount row');
    assert.strictEqual(syncedAccounts[0].bankName, 'Synced HDFC Bank');
    assert.strictEqual(syncedAccounts[0].holderName, 'Test Automatic Company Ltd');
    assert.strictEqual(syncedAccounts[0].accountNumberLast4, '5566');
    console.log('✓ Auto-synced CompanyBankAccount verified:');
    console.log('  Bank Name:', syncedAccounts[0].bankName);
    console.log('  Holder Name:', syncedAccounts[0].holderName);
    console.log('  Account Number Last 4:', syncedAccounts[0].accountNumberLast4);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ALL BANK FALLBACK & AUTO-SYNC TESTS PASSED (100%)');
    console.log('═══════════════════════════════════════════════════════════════');
  } finally {
    await prisma.companyBankAccount.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
