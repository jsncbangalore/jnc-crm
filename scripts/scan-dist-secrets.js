#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Secret & Sensitive Pattern Scanner for Production Dist Bundles
 * Scans apps/web/dist and apps/api/dist for:
 *   - Private keys
 *   - JWT secrets & hardcoded tokens
 *   - Database connection URLs with passwords
 *   - SMTP passwords
 *   - API keys (sk_*, AKIA*, ghp_*, xox*)
 *   - Authorization / Bearer tokens
 *   - Internal hostnames
 *   - .env content
 *   - Passwords
 *   - Names of internal environment variables in web client
 *   - Source maps (.map files) in web dist
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIST = path.join(ROOT_DIR, 'apps', 'web', 'dist');
const API_DIST = path.join(ROOT_DIR, 'apps', 'api', 'dist');

const SECRET_PATTERNS = [
  { name: 'Private Key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Database URL with password', regex: /postgres(?:ql)?:\/\/[a-zA-Z0-9_.-]+:[^@\s"']+@[a-zA-Z0-9_.-]+:[0-9]+\/[a-zA-Z0-9_.-]+/i },
  { name: 'Hardcoded Signed JWT', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Stripe API Key', regex: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Personal Access Token', regex: /gh[pos]_[a-zA-Z0-9]{36}/ },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,}/ },
  { name: 'Authorization Bearer Token', regex: /Bearer\s+eyJ[A-Za-z0-9_-]{20,}/i },
  { name: 'Internal Cloud Infrastructure Hostname', regex: /(?:\.internal\.render\.com|\.cluster\.local|db\.[a-z0-9_-]+\.supabase\.co)/i },
  { name: '.env File Assignment Content', regex: /^(?:DATABASE_URL|DIRECT_URL|JWT_SECRET|JWT_REFRESH_SECRET|ENCRYPTION_KEY)=.+$/m },
  { name: 'Hardcoded Password Assignment', regex: /(?:password|passwd|smtp_pass)\s*[:=]\s*["'](?!(?:password|passwd|Password|change_me|undefined|null|true|false)["'])[^"'\s]{8,}["']/i },
];

const INTERNAL_ENV_NAMES_FOR_WEB = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'BACKUP_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'BREVO_API_KEY',
  'SMTP_PASS',
  'SMTP_USER',
  'OTP_SECRET',
];

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz'
]);

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function scanDist(targetDir, isWebDist) {
  const violations = [];
  if (!fs.existsSync(targetDir)) {
    console.log(`[INFO] Target directory does not exist yet (run build first): ${targetDir}`);
    return violations;
  }

  const files = collectFiles(targetDir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const relPath = path.relative(ROOT_DIR, file);

    // Rule: Web dist must never contain source maps (.map)
    if (isWebDist && ext === '.map') {
      violations.push({
        file: relPath,
        rule: 'Source Map Exposure',
        details: 'Production web build must not contain .map source map files.',
      });
      continue;
    }

    if (BINARY_EXTS.has(ext)) continue;

    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Check general secret patterns
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(content)) {
        violations.push({
          file: relPath,
          rule: pat.name,
          details: `Matched forbidden pattern: ${pat.regex}`,
        });
      }
    }

    // For web dist, check that no internal backend environment variable names appear
    if (isWebDist) {
      for (const envName of INTERNAL_ENV_NAMES_FOR_WEB) {
        // Match string literals or identifiers matching internal env names
        const envRegex = new RegExp(`(?:["'\`]|process\\.env\\.)${envName}["'\`]`, 'g');
        if (envRegex.test(content)) {
          violations.push({
            file: relPath,
            rule: 'Internal Env Variable Name in Web Client',
            details: `Internal variable name "${envName}" detected in public web bundle.`,
          });
        }
      }
    }
  }

  return violations;
}

function run() {
  console.log('========================================================================');
  console.log('DIST SECRET & SENSITIVE PATTERN SCANNER');
  console.log('Scanning apps/web/dist and apps/api/dist...');
  console.log('========================================================================\n');

  const webViolations = scanDist(WEB_DIST, true);
  const apiViolations = scanDist(API_DIST, false);
  const allViolations = [...webViolations, ...apiViolations];

  if (allViolations.length > 0) {
    console.error(`[FAIL] Found ${allViolations.length} security violation(s) in dist bundles:\n`);
    for (const v of allViolations) {
      console.error(`  - [${v.rule}] in ${v.file}: ${v.details}`);
    }
    console.error('\n[FATAL] Production build contains sensitive data or source maps!');
    process.exit(1);
  }

  console.log('[PASS] Dist scanner completed successfully: Zero secrets, zero source maps, zero internal env leaks.');
  process.exit(0);
}

if (require.main === module) {
  run();
}

module.exports = { scanDist };
