/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs'); let c = fs.readFileSync('apps/web/src/pages/InventoryPage.tsx', 'utf8'); c = c.replace(/<button[^>]*onClick=\{\(\) => setActiveTab\('products'\)\}[^>]*>[\s\S]*?<\/button>/, ''); c = c.replace(/<button[^>]*onClick=\{\(\) => setActiveTab\('quick-add'\)\}[^>]*>[\s\S]*?<\/button>/, ''); fs.writeFileSync('apps/web/src/pages/InventoryPage.tsx', c);
