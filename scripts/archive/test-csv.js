/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { InventoryService } = require('./apps/api/dist/src/inventory/inventory.service.js'); const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); const inv = new InventoryService(prisma, null); async function test() { const rows = [{ 'SKU CODE': '123', 'PART NAME': 'Test Item', 'PRICE': '10' }]; const res = await inv.importSpreadsheet(rows, { role: 'admin' }, 'BLR-MAIN'); console.log(res); } test();
