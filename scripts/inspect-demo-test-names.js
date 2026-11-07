const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Inspecting [Demo] and Bracketed Test Names in jnc_crm_dev ===');

  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { name: { contains: '[' } },
        { name: { contains: 'Demo' } },
        { name: { contains: 'Test' } },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`Companies found (${companies.length}):`, companies);

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { customerName: { contains: '[' } },
        { customerName: { contains: 'Demo' } },
        { customerName: { contains: 'Test' } },
      ],
    },
    select: { id: true, customerName: true },
  });
  console.log(`Leads found (${leads.length}):`, leads);

  const quotations = await prisma.quotation.findMany({
    where: {
      OR: [
        { customerName: { contains: '[' } },
        { customerName: { contains: 'Demo' } },
        { customerName: { contains: 'Test' } },
      ],
    },
    select: { id: true, customerName: true, quoteNumber: true },
  });
  console.log(`Quotations found (${quotations.length}):`, quotations);

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { customerName: { contains: '[' } },
        { customerName: { contains: 'Demo' } },
        { customerName: { contains: 'Test' } },
      ],
    },
    select: { id: true, customerName: true, invoiceNumber: true },
  });
  console.log(`Invoices found (${invoices.length}):`, invoices);

  await prisma.$disconnect();
}

main().catch(console.error);
