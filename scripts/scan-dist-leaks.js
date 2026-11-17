/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_DIST = path.join(REPO_ROOT, 'apps/web/dist');
const API_DIST = path.join(REPO_ROOT, 'apps/api/dist');

const COMMON_BANNED_PATTERNS = [
  { name: 'DevPassword', regex: /DevPassword/i },
  { name: 'Admin@123', regex: /Admin@123/i },
  { name: 'DemoPassword', regex: /DemoPassword/i },
  { name: 'test accounts', regex: /test accounts/i },
  { name: 'secret123', regex: /secret123/i },
  { name: 'Dev box seed email domain (seed.dev)', regex: /@(?:[a-zA-Z0-9-]+\.)?seed\.dev/i },
];

const WEB_BANNED_PATTERNS = [
  ...COMMON_BANNED_PATTERNS,
  { name: 'dev-demo-login', regex: /dev-demo-login/i },
  { name: 'dev-credentials-box', regex: /dev-credentials-box/i },
  { name: 'Fixed OTP / Verification Code Bypass flag', regex: /(?:DEV_FIXED_OTP|FIXED_OTP|DEV_VERIFICATION_CODE|dev-fixed-otp)/i },
  { name: 'Fixed verification bypass string', regex: /(?:dev-fixed-code|bypass-verification-code|fixed-verification-code)/i },
];

const API_BANNED_PATTERNS = [
  ...COMMON_BANNED_PATTERNS,
];

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Inspect all script and html bundles
      if (['.js', '.mjs', '.cjs', '.html', '.css', '.json'].includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function scanDirectory(dir, label, patterns) {
  console.log(`\nScanning ${label} (${dir})...`);
  const files = getAllFiles(dir);
  console.log(`Found ${files.length} build asset files to inspect.`);

  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(REPO_ROOT, file);

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        violations.push({
          file: relativePath,
          pattern: pattern.name,
        });
      }
    }
  }

  return violations;
}

function runLeakScan() {
  console.log('========================================================================');
  console.log('PRODUCTION BUNDLE LEAK SCANNER (apps/web/dist & apps/api/dist)');
  console.log('Checking for dev fallback passwords, aliases, test account leaks & seed domains');
  console.log('========================================================================');

  const webViolations = scanDirectory(WEB_DIST, 'Web Production Dist', WEB_BANNED_PATTERNS);
  const apiViolations = scanDirectory(API_DIST, 'API Production Dist', API_BANNED_PATTERNS);

  const allViolations = [...webViolations, ...apiViolations];

  if (allViolations.length > 0) {
    console.error('\n[CRITICAL FAILURE] Production bundle scan detected forbidden dev credentials / leaks:');
    for (const v of allViolations) {
      console.error(`  - [VIOLATION] ${v.file}: matched "${v.pattern}"`);
    }
    console.error('\nBuild cannot be packed for release. Exiting with error code 1.\n');
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('[PASS] ZERO DEV PASSWORDS, TEST ACCOUNTS, OR SEED DOMAINS IN PRODUCTION BUNDLES!');
  console.log('========================================================================\n');
}

runLeakScan();
