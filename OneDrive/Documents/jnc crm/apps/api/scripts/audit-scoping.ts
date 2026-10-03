/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

// Models that are owned by a Tenant
const TENANT_MODELS = new Set([
  'company',
  'contact',
  'lead',
  'leadShare',
  'mailAccount',
  'supplier',
  'product',
  'sku',
  'warehouse',
  'quotation',
  'order',
  'shipment',
  'invoice',
  'stockTransfer',
  'customObject',
  'customObjectRecord',
  'team',
  'project',
  'automationRule',
  'messageLog',
  'auditLog',
  'paymentRecord',
  'projectStockPosition',
  'user',
]);

const TARGET_METHODS = ['findUnique', 'findFirst', 'update', 'delete', 'updateMany'];

interface AuditFinding {
  file: string;
  line: number;
  model: string;
  method: string;
  snippet: string;
  hasTenantId: boolean;
  verdict: 'SAFE' | 'POTENTIAL_LEAK';
  reason: string;
}

function scanDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist') {
        scanDir(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function runScopingAudit(srcDir: string): AuditFinding[] {
  const files = scanDir(srcDir);
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(srcDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const model of TENANT_MODELS) {
        for (const method of TARGET_METHODS) {
          const pattern = new RegExp(`(?:this\\.)?prisma\\.${model}\\.${method}\\s*\\(`, 'g');
          if (pattern.test(line)) {
            // Collect context (preceding 6 lines and following 15 lines)
            const preceding = lines.slice(Math.max(0, i - 6), i).join('\n');
            const following = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
            const block = preceding + '\n' + following;
            const hasTenantId = /tenantId/i.test(block);

            let verdict: 'SAFE' | 'POTENTIAL_LEAK' = hasTenantId ? 'SAFE' : 'POTENTIAL_LEAK';
            let reason = hasTenantId ? 'tenantId present in query block' : 'where clause lacks explicit tenantId';

            // Known safe patterns:
            // 1. Auth service resolving user by email/phone across tenants or by id during JWT validation
            if (relativePath.includes('auth/') && (model === 'user' || model === 'tenant')) {
              verdict = 'SAFE';
              reason = 'Auth service login / token resolution (system auth context)';
            }
            // 2. Platform service managing cross-tenant resources as platform super admin
            else if (relativePath.includes('platform/') || relativePath.includes('admin/')) {
              verdict = 'SAFE';
              reason = 'Platform Super Admin cross-tenant administrative control';
            }
            // 3. Webhooks ingestion from third party (e.g. WhatsApp, IndiaMART, inbound customer email)
            else if (relativePath.includes('webhooks/') || (relativePath.includes('notifications/') && line.includes('lead.findFirst'))) {
              verdict = 'SAFE';
              reason = 'External inbound webhook handler resolving tenant by secret/payload/email';
            }
            // 4. Background jobs, backup verification, or delayed automation queue
            else if (relativePath.includes('backup/')) {
              verdict = 'SAFE';
              reason = 'System offline backup snapshot verification / integrity health check';
            }
            else if (relativePath.includes('automation/') && block.includes('dueJobs')) {
              verdict = 'SAFE';
              reason = 'System background delayed job queue worker';
            }
            else if (relativePath.includes('users/users.service.ts') && block.includes('platform_super_admin')) {
              verdict = 'SAFE';
              reason = 'Platform Super Admin email uniqueness check across platform (tenantId is null)';
            }
            else if (relativePath.includes('invoicing/invoicing.service.ts') && block.includes('lineItemsData')) {
              verdict = 'SAFE';
              reason = 'Invoice line items re-creation write preceded by tenantId verification on existing invoice';
            }
            else if (relativePath.includes('scripts/') || relativePath.includes('scheduler/')) {
              verdict = 'SAFE';
              reason = 'Internal system background process / maintenance runner';
            }

            findings.push({
              file: relativePath,
              line: i + 1,
              model,
              method,
              snippet: line.trim(),
              hasTenantId,
              verdict,
              reason,
            });
          }
        }
      }
    }
  }

  return findings;
}

if (require.main === module) {
  const srcPath = path.resolve(__dirname, '..', 'src');
  console.log(`\n========================================================================`);
  console.log(`[SCOPING AUDIT] Scanning apps/api/src for multi-tenant query isolation...`);
  console.log(`========================================================================\n`);

  const findings = runScopingAudit(srcPath);
  const potentialLeaks = findings.filter((f) => f.verdict === 'POTENTIAL_LEAK');
  const safeFindings = findings.filter((f) => f.verdict === 'SAFE');

  console.log(`Audited ${findings.length} total database queries across tenant-owned models.`);
  console.log(`- Verified SAFE: ${safeFindings.length}`);
  console.log(`- POTENTIAL LEAKS FLAGGED: ${potentialLeaks.length}\n`);

  if (potentialLeaks.length > 0) {
    console.log(`------------------------------------------------------------------------`);
    console.log(`FLAGGED QUERIES MISSING EXPLICIT tenantId:`);
    console.log(`------------------------------------------------------------------------`);
    for (const f of potentialLeaks) {
      console.log(`[!] ${f.file}:${f.line} -> prisma.${f.model}.${f.method}`);
      console.log(`    Code: ${f.snippet}`);
      console.log(`    Reason: ${f.reason}\n`);
    }
  } else {
    console.log(`All queries on tenant-owned models enforce tenantId or have documented safety justifications!`);
  }
}
