/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const controllers = {
    'dashboard': 'apps/api/src/dashboard/dashboard.controller.ts',
    'leads': 'apps/api/src/leads/leads.controller.ts',
    'orders': 'apps/api/src/orders/orders.controller.ts',
    'invoices': 'apps/api/src/invoicing/invoicing.controller.ts',
    'quotations': 'apps/api/src/quotations/quotations.controller.ts',
    'inventory': 'apps/api/src/inventory/inventory.controller.ts',
    'suppliers': 'apps/api/src/suppliers/suppliers.controller.ts',
    'automation': 'apps/api/src/automation/automation.controller.ts',
    'users': 'apps/api/src/users/users.controller.ts',
    'custom_objects': 'apps/api/src/custom-objects/custom-objects.controller.ts',
    'audit_logs': 'apps/api/src/audit/audit.controller.ts',
};

for (const [key, filepath] of Object.entries(controllers)) {
    const fullPath = path.resolve(filepath);
    if (!fs.existsSync(fullPath)) continue;

    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('PageAccess')) {
        content = content.replace(
            "from '@nestjs/common';", 
            "from '@nestjs/common';\nimport { PageAccess } from '../auth/page-access.decorator';"
        );
        content = content.replace(
            "export class ", 
            `@PageAccess('${key}')\nexport class `
        );
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${filepath}`);
    }
}
