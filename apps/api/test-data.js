/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); async function main() { const t = await prisma.invoice.findFirst({where: {customerName: {contains: 'Tata'}}}); const v = await prisma.invoice.findFirst({where: {customerName: {contains: 'VK'}}}); console.log('Tata:', t); console.log('VK:', v); } main().finally(() => prisma.$disconnect());
