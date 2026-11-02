/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs'); let c = fs.readFileSync('apps/api/src/inventory/inventory.service.ts', 'utf8'); c = c.replace(/results\.errors\.push\(.Row \\\$\{i \+ 1\}: SKU Code and Name are required\..*\);/, 'results.errors.push(\Row : SKU Code and Name are required. (Headers found: )\);'); fs.writeFileSync('apps/api/src/inventory/inventory.service.ts', c);
