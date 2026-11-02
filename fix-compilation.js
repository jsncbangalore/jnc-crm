/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');

// Fix auth.service.ts
let auth = fs.readFileSync('apps/api/src/auth/auth.service.ts', 'utf8');
auth = auth.replace(/include: \{ teamRef: \{ select: \{ id: true, name: true, allowedPages: true \} \} \}, where: \{ identityKey: lockKey \},/g, 'where: { identityKey: lockKey },');
fs.writeFileSync('apps/api/src/auth/auth.service.ts', auth);

// Fix inventory.service.ts
let inv = fs.readFileSync('apps/api/src/inventory/inventory.service.ts', 'utf8');
if (!inv.includes('private backupService: BackupService')) {
  inv = inv.replace(
    'private auditService: AuditService,',
    'private auditService: AuditService,\n    private backupService: BackupService,'
  );
  fs.writeFileSync('apps/api/src/inventory/inventory.service.ts', inv);
}
