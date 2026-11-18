/**
 * Read-only script to audit default LUT bond number and validity across tenants and invoices.
 * Prints counts only (no tenant names, no personal/customer data).
 * Safe for auditing production or staging databases.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_LUT_BOND = 'AD290525013648T';
const DEFAULT_LUT_VALIDITY = 'From : 10/05/2025 To: 09/05/2026';

async function main() {
  console.log('=== LUT Default Values Audit (Read-Only) ===');
  console.log(`Checking for default LUT Bond No: "${DEFAULT_LUT_BOND}"`);
  console.log(`Checking for default LUT Validity: "${DEFAULT_LUT_VALIDITY}"\n`);

  try {
    // 1. Tenants with default LUT
    const tenantsWithDefaultBond = await prisma.tenant.count({
      where: { lutBondNo: DEFAULT_LUT_BOND },
    });
    const tenantsWithDefaultValidity = await prisma.tenant.count({
      where: { lutValidity: DEFAULT_LUT_VALIDITY },
    });
    const tenantsWithEither = await prisma.tenant.count({
      where: {
        OR: [
          { lutBondNo: DEFAULT_LUT_BOND },
          { lutValidity: DEFAULT_LUT_VALIDITY },
        ],
      },
    });

    // 2. Invoices with default LUT
    const totalInvoices = await prisma.invoice.count();
    const invoicesWithDefaultBond = await prisma.invoice.count({
      where: { lutBondNo: DEFAULT_LUT_BOND },
    });
    const invoicesWithDefaultValidity = await prisma.invoice.count({
      where: { lutValidity: DEFAULT_LUT_VALIDITY },
    });
    const nonSezInvoicesWithDefault = await prisma.invoice.count({
      where: {
        isSez: false,
        OR: [
          { lutBondNo: DEFAULT_LUT_BOND },
          { lutValidity: DEFAULT_LUT_VALIDITY },
        ],
      },
    });
    const sezInvoicesWithDefault = await prisma.invoice.count({
      where: {
        isSez: true,
        OR: [
          { lutBondNo: DEFAULT_LUT_BOND },
          { lutValidity: DEFAULT_LUT_VALIDITY },
        ],
      },
    });

    console.log('--- TENANTS ---');
    console.log(`Tenants with default LUT Bond No:  ${tenantsWithDefaultBond}`);
    console.log(`Tenants with default LUT Validity: ${tenantsWithDefaultValidity}`);
    console.log(`Total tenants affected:            ${tenantsWithEither}\n`);

    console.log('--- INVOICES ---');
    console.log(`Total invoices in database:        ${totalInvoices}`);
    console.log(`Invoices with default LUT Bond:    ${invoicesWithDefaultBond}`);
    console.log(`Invoices with default LUT Validity:${invoicesWithDefaultValidity}`);
    console.log(`Non-SEZ invoices affected:         ${nonSezInvoicesWithDefault}`);
    console.log(`SEZ invoices affected:             ${sezInvoicesWithDefault}\n`);

    console.log('=== Audit Complete ===');
  } catch (err) {
    console.error('Audit failed with error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
