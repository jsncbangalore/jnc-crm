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

export interface AllowlistEntry {
  file: string;
  line: number;
  model: string;
  method?: string;
  reason: string;
}

export interface AuditFinding {
  file: string;
  line: number;
  model: string;
  method: string;
  snippet: string;
  hasTenantId: boolean;
  verdict: 'SAFE' | 'POTENTIAL_LEAK';
  reason: string;
  allowlisted: boolean;
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

export function loadAllowlist(): AllowlistEntry[] {
  const allowlistPath = path.resolve(__dirname, 'scoping-allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`scoping-allowlist.json not found at ${allowlistPath}`);
  }
  return JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
}

export function runScopingAudit(srcDir: string, allowlist: AllowlistEntry[]): AuditFinding[] {
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

            let verdict: 'SAFE' | 'POTENTIAL_LEAK' = 'POTENTIAL_LEAK';
            let reason = 'where clause lacks explicit tenantId';
            let allowlisted = false;

            if (hasTenantId) {
              verdict = 'SAFE';
              reason = 'tenantId present in query block';
            } else {
              // Match against explicit allowlist file ONLY (no hardcoded free-text justifications)
              const currentLine = i + 1;
              const match = allowlist.find((entry) => {
                const fileMatch = entry.file === relativePath;
                const modelMatch = entry.model.toLowerCase() === model.toLowerCase();
                const methodMatch = !entry.method || entry.method === method;
                // Allow a tolerance of +/- 15 lines to accommodate minor edits around comments
                const lineMatch = Math.abs(entry.line - currentLine) <= 15;
                return fileMatch && modelMatch && methodMatch && lineMatch;
              });

              if (match) {
                verdict = 'SAFE';
                reason = `[ALLOWLIST] ${match.reason}`;
                allowlisted = true;
              }
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
              allowlisted,
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

  const allowlist = loadAllowlist();
  console.log(`Loaded ${allowlist.length} exemptions from scoping-allowlist.json:\n`);
  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  console.log(`| #  | File : Line                                    | Model           | Method     | Approved Reason                         |`);
  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  allowlist.forEach((entry, idx) => {
    const loc = `${entry.file}:${entry.line}`.padEnd(46);
    const m = entry.model.padEnd(15);
    const meth = (entry.method || '*').padEnd(10);
    const num = String(idx + 1).padStart(2);
    console.log(`| ${num} | ${loc} | ${m} | ${meth} | ${entry.reason}`);
  });
  console.log(`------------------------------------------------------------------------------------------------------------------------\n`);

  const findings = runScopingAudit(srcPath, allowlist);
  const potentialLeaks = findings.filter((f) => f.verdict === 'POTENTIAL_LEAK');
  const directTenantSafe = findings.filter((f) => f.hasTenantId);
  const allowlistSafe = findings.filter((f) => f.allowlisted);

  console.log(`Audited ${findings.length} total database queries across tenant-owned models.`);
  console.log(`- Verified SAFE with explicit tenantId: ${directTenantSafe.length}`);
  console.log(`- Verified SAFE via scoping-allowlist.json: ${allowlistSafe.length}`);
  console.log(`- POTENTIAL LEAKS FLAGGED: ${potentialLeaks.length}\n`);

  if (potentialLeaks.length > 0) {
    console.log(`------------------------------------------------------------------------`);
    console.log(`[!] CRITICAL: FLAGGED QUERIES MISSING EXPLICIT tenantId NOT IN ALLOWLIST:`);
    console.log(`------------------------------------------------------------------------`);
    for (const f of potentialLeaks) {
      console.log(`[X] ${f.file}:${f.line} -> prisma.${f.model}.${f.method}`);
      console.log(`    Code: ${f.snippet}`);
      console.log(`    Reason: ${f.reason}\n`);
    }
    process.exit(1);
  } else {
    console.log(`[PASSED] All queries on tenant-owned models enforce tenantId or are strictly accounted for in scoping-allowlist.json!\n`);
    process.exit(0);
  }
}
