/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '.system_generated', 'coverage'];

const SUSPICIOUS_PATTERNS = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:api_key|apiKey|secret_key|secretKey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{24,}['"]/i,
  /postgres:\/\/[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+@/i,
  /aws_secret_access_key/i,
];

let findings = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip comments and test files
    if (filePath.includes('.test.') || filePath.includes('test-') || filePath.includes('.spec.')) return;
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) return;

    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          file: path.relative(ROOT, filePath),
          line: index + 1,
          matched: line.trim().slice(0, 80),
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

console.log('--- Scanning codebase for hardcoded secrets ---');
scanDir(path.join(ROOT, 'apps', 'api', 'src'));
scanDir(path.join(ROOT, 'apps', 'web', 'src'));

if (findings.length === 0) {
  console.log('PASSED: No hardcoded secrets detected in source files.');
  process.exit(0);
} else {
  console.error(`FAILED: Found ${findings.length} potential hardcoded secrets:`);
  findings.forEach((f) => console.error(`  - ${f.file}:${f.line}: ${f.matched}`));
  process.exit(1);
}
