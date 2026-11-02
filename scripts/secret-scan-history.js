/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isStrictHistory = process.argv.includes('--strict') || process.argv.includes('--history');

function isForbiddenFile(filename) {
  // Allow template / example files
  if (filename.endsWith('.example') || filename.endsWith('.production')) {
    return false;
  }
  const basename = path.basename(filename);
  if (/^\.env/i.test(basename)) return true;
  if (/Super Admin\.txt/i.test(basename)) return true;
  if (/live\.env/i.test(basename)) return true;
  if (/\.pem$/i.test(basename)) return true;
  if (/bootstrap-credentials/i.test(basename)) return true;
  if (/(?:^|\/)data\/.*\.json$/i.test(filename)) return true;
  return false;
}

console.log('=== REPO HYGIENE & SECRET SCAN (FULL GIT HISTORY) ===');

// 1. Check git ls-files
console.log('\n[Step 1] Checking tracked files in git ls-files...');
const lsFiles = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
let trackedViolations = [];

for (const file of lsFiles) {
  if (isForbiddenFile(file)) {
    trackedViolations.push(file);
  }
}

if (trackedViolations.length === 0) {
  console.log('PASSED: No sensitive files currently tracked in git ls-files.');
} else {
  console.error('FAILED: Tracked sensitive files found in git ls-files:', trackedViolations);
}

// 2. Check full git history for sensitive filenames
console.log('\n[Step 2] Scanning full git commit history for sensitive filenames...');
const historyFilesRaw = execSync('git log --all --name-only --format=""', { cwd: ROOT, encoding: 'utf8' });
const historyFiles = Array.from(new Set(historyFilesRaw.split('\n').filter(Boolean)));

let historyViolations = [];
for (const file of historyFiles) {
  if (isForbiddenFile(file)) {
    historyViolations.push(file);
  }
}

if (historyViolations.length === 0) {
  console.log('PASSED: No sensitive files found across full git history.');
} else {
  console.log('NOTICE: Sensitive files found in historical commits:', historyViolations);
  console.log('(Note: Do not rewrite git history until explicitly confirmed by project administrator.)');
}

// 3. Scan code content for hardcoded secrets
console.log('\n[Step 3] Running source code secret content scan...');
const SUSPICIOUS_PATTERNS = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:api_key|apiKey|secret_key|secretKey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{24,}['"]/i,
  /postgres:\/\/[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+@/i,
  /aws_secret_access_key/i,
];

let contentFindings = [];
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '.system_generated', 'coverage'];

function scanFile(filePath) {
  if (filePath.includes('.test.') || filePath.includes('test-') || filePath.includes('.spec.')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return;
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(line)) {
        contentFindings.push({
          file: path.relative(ROOT, filePath),
          line: index + 1,
          matched: trimmed.slice(0, 80),
        });
      }
    }
  });
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (
      entry.name.endsWith('.ts') ||
      entry.name.endsWith('.tsx') ||
      entry.name.endsWith('.js') ||
      entry.name.endsWith('.json')
    ) {
      scanFile(fullPath);
    }
  }
}

scanDir(path.join(ROOT, 'apps', 'api', 'src'));
scanDir(path.join(ROOT, 'apps', 'web', 'src'));

if (contentFindings.length === 0) {
  console.log('PASSED: No hardcoded secrets detected in source code files.');
} else {
  console.error(`FAILED: Found ${contentFindings.length} potential hardcoded secrets:`);
  contentFindings.forEach((f) => console.error(`  - ${f.file}:${f.line}: ${f.matched}`));
}

const totalBlockingErrors = trackedViolations.length + contentFindings.length + (isStrictHistory ? historyViolations.length : 0);

console.log('\n--- SCAN SUMMARY ---');
console.log(`Tracked Violations: ${trackedViolations.length}`);
console.log(`History File Findings: ${historyViolations.length}`);
console.log(`Content Secret Findings: ${contentFindings.length}`);

if (totalBlockingErrors === 0) {
  console.log('OVERALL RESULT: SUCCESS (Hygiene & Secret Scan Passed)');
  process.exit(0);
} else {
  console.error('OVERALL RESULT: FAILED (Action Required)');
  process.exit(1);
}
