/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); async function main() { console.log('Leads:', await prisma.lead.count()); console.log('Orders:', await prisma.order.count()); console.log('Invoices:', await prisma.invoice.count()); console.log('Suppliers:', await prisma.supplier.count()); } main().catch(console.error).finally(() => prisma.$disconnect());
