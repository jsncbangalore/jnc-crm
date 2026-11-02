/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_FILE = path.resolve(ROOT, 'scripts/brand-allowlist.json');

console.log('========================================================================');
console.log('INTEGRITY SCANNER FIXTURE & ALLOWLIST VERIFICATION TEST');
console.log('========================================================================\n');

// ─── Test 1: Validate brand-allowlist.json ──────────────────────────────────
console.log('[Test 1] Validating that brand-allowlist.json contains ONLY permitted files...');
assert(fs.existsSync(ALLOWLIST_FILE), 'brand-allowlist.json must exist');

const allowlistData = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
const allowedFiles = allowlistData.allowedFilesForBrandName;

assert(Array.isArray(allowedFiles), 'allowedFilesForBrandName must be an array');
assert(allowedFiles.length > 0, 'allowedFilesForBrandName must not be empty');

const FORBIDDEN_PATH_PATTERNS = [
  'login',
  'dashboard',
  'email',
  'pdf',
  'publicinquiry',
  'import',
  'template',
  'test',
  'scripts',
];

const PERMITTED_PATTERNS = [
  'brand.ts',
  'LandingPage.tsx',
  'CookieConsentPage.tsx',
  'TermsPage.tsx',
  'PrivacyPage.tsx',
  'logo.png',
  'logo-dark.png',
  'logo-icon.png',
  'favicon.svg',
  'favicon.png',
  'favicon-32x32.png',
  'index.html',
  'index-*.js',
];

for (const entry of allowedFiles) {
  const lower = entry.toLowerCase();
  
  // Must match permitted categories
  const matchesPermitted = PERMITTED_PATTERNS.some((p) => {
    if (p.includes('*')) {
      const regex = new RegExp(p.replace(/\*/g, '.*'));
      return regex.test(path.basename(entry));
    }
    return entry.endsWith(p);
  });

  assert(
    matchesPermitted,
    `Allowlist entry "${entry}" is not permitted! Only brand config, public index page, brand assets, and legal pages may be allowlisted.`
  );

  // Must not match any forbidden paths
  for (const forbidden of FORBIDDEN_PATH_PATTERNS) {
    if (lower.includes(forbidden) && !lower.includes('template')) {
      assert.fail(`Allowlist contains forbidden path category "${forbidden}": ${entry}`);
    }
  }
}
console.log(`[PASS] Allowlist contains exactly ${allowedFiles.length} strictly permitted files.\n`);

// ─── Test 2: Deliberately Bad Fixtures Must Fail ─────────────────────────────
console.log('[Test 2] Testing that deliberate bad fixtures trigger scan failures...');

const FIXTURES_DIR = path.resolve(ROOT, 'scripts/__fixtures_bad__');
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

const badCases = [
  {
    name: 'bad-brand-leak.ts',
    content: `export const leak = 'JNC CRM in dashboard screen';`,
    expectedRule: 'Brand or Company name is only permitted',
  },
  {
    name: 'bad-sample-rajesh.ts',
    content: `export const lead = { name: 'Rajesh Sharma' };`,
    expectedRule: "Prohibited sample name 'Rajesh Sharma' found",
  },
  {
    name: 'bad-sample-priya.ts',
    content: `export const lead = { name: 'Priya Patel' };`,
    expectedRule: "Prohibited sample name 'Priya Patel' found",
  },
  {
    name: 'bad-sample-vikram.ts',
    content: `export const lead = { name: 'Vikram Sundaram' };`,
    expectedRule: "Prohibited sample name 'Vikram Sundaram' found",
  },
  {
    name: 'bad-phone-number.ts',
    content: `export const phone = '+91 98765 43210';`,
    expectedRule: 'Prohibited phone number pattern found',
  },
  {
    name: 'bad-phone-hyphen.ts',
    content: `export const phone = '98765-43210';`,
    expectedRule: 'Prohibited phone number pattern found',
  },
  {
    name: 'bad-email-domain.ts',
    content: `export const email = 'user@unapprovedcompany.org';`,
    expectedRule: 'Unapproved non-example email domain',
  },
  {
    name: 'bad-cloudflared.ts',
    content: `// Run cloudflared tunnel --url http://test`,
    expectedRule: "Developer tunnel tool 'cloudflared' prohibited",
  },
  {
    name: 'bad-statistics-claim.ts',
    content: `export const banner = 'Teams close 35% more deals';`,
    expectedRule: "Unverified statistics claim ('35%') prohibited",
  },
];

let failedTests = 0;

for (const tc of badCases) {
  const filePath = path.join(FIXTURES_DIR, tc.name);
  fs.writeFileSync(filePath, tc.content, 'utf8');

  try {
    execSync('node scripts/scan-branding.js', { cwd: ROOT, stdio: 'pipe' });
    console.error(`[FAIL] Bad fixture "${tc.name}" unexpectedly passed the scan!`);
    failedTests++;
  } catch (err) {
    const output = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
    if (output.includes(tc.expectedRule)) {
      console.log(`  ✓ Fixture "${tc.name}" correctly failed with rule: "${tc.expectedRule}"`);
    } else {
      console.error(`[FAIL] Fixture "${tc.name}" failed with unexpected message:`, output);
      failedTests++;
    }
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Clean up fixtures dir
if (fs.existsSync(FIXTURES_DIR)) {
  fs.rmdirSync(FIXTURES_DIR);
}

if (failedTests > 0) {
  console.error(`\n[FAIL] ${failedTests} bad fixture test(s) failed.`);
  process.exit(1);
}

console.log('\n[PASS] All 9 deliberate bad fixtures correctly failed the integrity scanner.');
process.exit(0);
