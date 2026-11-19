/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs'); 
let c = fs.readFileSync('apps/api/src/inventory/inventory.service.ts', 'utf8'); 

// First undo my previous mistake
c = c.replace(/results\.errors\.push\(\`Row \$\{i \+ 1\}: SKU Code and Name are required\. \(Keys: \$\{Object\.keys\(row\)\.join\(\", \"\)\}\)\`\);\s*if \(\!skuCode \|\| \!name\) \{/g, 'if (!skuCode || !name) {');

// Now replace the INSIDE of the if statement
c = c.replace(/results\.errors\.push\(\`Row \$\{i \+ 1\}: SKU Code and Name are required\.\`\);/g, 'results.errors.push(`Row ${i + 1}: SKU Code and Name are required. (Keys: ${Object.keys(row).join(", ")})`);');

fs.writeFileSync('apps/api/src/inventory/inventory.service.ts', c);
