const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function cleanName(name) {
  if (!name) return name;
  return name
    .replace(/\[\s*Demo\s*\]/gi, '')
    .replace(/\[\s*Test\s*\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .trim();
}

async function main() {
  console.log('=== Cleaning [Demo] and Bracketed Tags from jnc_crm_dev ===');

  // 1. Leads
  const leads = await prisma.lead.findMany({
    where: { customerName: { contains: '[' } },
  });
  console.log(`Found ${leads.length} leads with bracket tags.`);
  for (const l of leads) {
    const cleaned = cleanName(l.customerName);
    await prisma.lead.update({
      where: { id: l.id },
      data: { customerName: cleaned },
    });
    console.log(`  Updated Lead ${l.id}: "${l.customerName}" -> "${cleaned}"`);
  }

  // 2. Quotations
  const quotations = await prisma.quotation.findMany({
    where: { customerName: { contains: '[' } },
  });
  console.log(`Found ${quotations.length} quotations with bracket tags.`);
  for (const q of quotations) {
    const cleaned = cleanName(q.customerName);
    await prisma.quotation.update({
      where: { id: q.id },
      data: { customerName: cleaned },
    });
    console.log(`  Updated Quotation ${q.quoteNumber}: "${q.customerName}" -> "${cleaned}"`);
  }

  // 3. Invoices
  const invoices = await prisma.invoice.findMany({
    where: { customerName: { contains: '[' } },
  });
  console.log(`Found ${invoices.length} invoices with bracket tags.`);
  for (const inv of invoices) {
    const cleaned = cleanName(inv.customerName);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { customerName: cleaned },
    });
    console.log(`  Updated Invoice ${inv.invoiceNumber}: "${inv.customerName}" -> "${cleaned}"`);
  }

  // 4. Companies
  const companies = await prisma.company.findMany({
    where: { name: { contains: '[' } },
  });
  console.log(`Found ${companies.length} companies with bracket tags.`);
  for (const c of companies) {
    const cleaned = cleanName(c.name);
    await prisma.company.update({
      where: { id: c.id },
      data: { name: cleaned },
    });
    console.log(`  Updated Company ${c.id}: "${c.name}" -> "${cleaned}"`);
  }

  // 5. Contacts
  const contacts = await prisma.contact.findMany({
    where: { name: { contains: '[' } },
  });
  console.log(`Found ${contacts.length} contacts with bracket tags.`);
  for (const c of contacts) {
    const cleaned = cleanName(c.name);
    await prisma.contact.update({
      where: { id: c.id },
      data: { name: cleaned },
    });
    console.log(`  Updated Contact ${c.id}: "${c.name}" -> "${cleaned}"`);
  }

  console.log('=== Cleanup complete ===');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
