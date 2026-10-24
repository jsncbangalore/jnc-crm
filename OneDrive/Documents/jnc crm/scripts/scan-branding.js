/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TARGET_DIRECTORIES = [
  'apps/api/src',
  'apps/api/prisma',
  'apps/api/test',
  'apps/web/src',
  'apps/web/public',
  'scripts',
  'docs',
  'deploy',
];

const TARGET_FILES = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/web/index.html',
  'render.yaml',
  '.htaccess',
];

const IGNORE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz',
  '.pdf',
]);

const PROHIBITED_DB_EXTENSIONS = new Set([
  '.db', '.sqlite', '.sqlite3', '.db-journal', '.db.enc',
]);

// Dynamically construct banned tokens so scanner doesn't match itself
const KW_JSNC = ['js', 'nc'].join('');
const KW_JS_NET = ['js', ' ', 'network'].join('');
const KW_RESEND_DEV = ['resend', '.', 'dev'].join('');
const KW_JNC_RD = ['Users', 'JNC R&D'].join('\\');
const KW_JNC_RD_SLASH = ['Users', 'JNC R&D'].join('/');
const KW_JAYARAJ = ['jaya', 'raj'].join('');
const KW_SANTHOSH = ['san', 'thosh'].join('');
const KW_LUT_BOND = ['AD29', '0525', '0136', '48T'].join('');

const PROHIBITED_TERMS = [
  ['crm', 'flow'].join(''),
  ['copper', 'line'].join(''),
  ['bris', 'ko'].join(''),
  ['lan', 'tern'].join(''),
  ['ve', 'lum'].join(''),
  ['tes', 'sa'].join(''),
  ['quar', 'ra'].join(''),
  ['continue', ' ', 'with'].join(''),
  ['coming', ' ', 'soon'].join(''),
];

const FAKE_TESTIMONIAL_PATTERNS = [
  new RegExp(['head', 'of', 'growth'].join('\\s+'), 'i'),
  new RegExp(['vp', 'of', 'sales'].join('\\s+'), 'i'),
  new RegExp(['revops', 'lead'].join('\\s+'), 'i'),
  new RegExp(['relied', 'on', 'by'].join('\\s+'), 'i'),
];

const ALLOWED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.internal',
  'company.com',
  'customer.com',
  'vendor.com',
  'yourcompany.com',
  'client.com',
  'test.com',
  'mail.com',
  'localhost',
]);

let violations = [];

function checkFile(filePath) {
  const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');

  // Check: Prohibited DB files
  const ext = path.extname(filePath).toLowerCase();
  if (PROHIBITED_DB_EXTENSIONS.has(ext)) {
    violations.push({
      file: relativePath,
      line: 1,
      rule: 'Database file present in tracked tree',
      match: path.basename(filePath),
    });
    return;
  }

  // Check: Prohibited logo filenames containing company names
  const fileNameLower = path.basename(filePath).toLowerCase();
  if (fileNameLower.includes(KW_JSNC) || fileNameLower.includes('crmflow')) {
    violations.push({
      file: relativePath,
      line: 1,
      rule: 'Logo or asset file with company name',
      match: path.basename(filePath),
    });
    return;
  }

  // Skip binary/media files for content scanning
  if (IGNORE_EXTENSIONS.has(ext)) return;

  // Skip self
  if (path.basename(filePath) === 'scan-branding.js') return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check: Keywords (jsnc, js network, resend.dev)
    if (lowerLine.includes(KW_JSNC)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_JSNC}' prohibited`,
        match: line.trim(),
      });
    }

    if (lowerLine.includes(KW_JS_NET)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_JS_NET}' prohibited`,
        match: line.trim(),
      });
    }

    if (lowerLine.includes(KW_RESEND_DEV)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_RESEND_DEV}' prohibited`,
        match: line.trim(),
      });
    }

    if (lowerLine.includes(KW_JAYARAJ)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited name found: '${KW_JAYARAJ}'`,
        match: line.trim(),
      });
    }

    if (lowerLine.includes(KW_SANTHOSH)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited name found: '${KW_SANTHOSH}'`,
        match: line.trim(),
      });
    }

    if (line.includes(KW_LUT_BOND)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited credential/identifier found: '${KW_LUT_BOND}'`,
        match: line.trim(),
      });
    }

    // Check: Prohibited words (CRMflow, Copperline, Brisko, Lantern, Velum, Tessa, Quarra, Continue with, coming soon)
    for (const term of PROHIBITED_TERMS) {
      if (lowerLine.includes(term)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Prohibited word/brand '${term}' found`,
          match: line.trim(),
        });
      }
    }

    // Check: Fake testimonial patterns
    for (const pat of FAKE_TESTIMONIAL_PATTERNS) {
      if (pat.test(line)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'Fake testimonial pattern found',
          match: line.trim(),
        });
      }
    }

    // Check: Local Windows user paths (Users/JNC R&D)
    if (line.includes(KW_JNC_RD) || line.includes(KW_JNC_RD_SLASH) || (line.includes('Users') && line.includes('JNC R&D'))) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'Local Windows user path prohibited',
        match: line.trim(),
      });
    }

    // Check: Real email addresses
    const emailMatches = line.matchAll(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g);
    for (const em of emailMatches) {
      const fullEmail = em[0].toLowerCase();
      const domain = em[2].toLowerCase();

      // Check if this match is actually inside a URL (e.g. postgres://user:pass@host)
      const atIdx = em.index;
      const beforeAt = line.substring(Math.max(0, atIdx - 30), atIdx);
      if (beforeAt.includes('://') || beforeAt.includes('postgres') || beforeAt.includes('http')) {
        continue;
      }

      // Check strictly prohibited domains
      if (domain === [KW_JSNC, '.co.in'].join('') || domain === 'gmail.com') {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Prohibited email domain: @${domain}`,
          match: fullEmail,
        });
      } else if (
        !ALLOWED_EMAIL_DOMAINS.has(domain) &&
        !domain.endsWith('.example') &&
        !domain.endsWith('.test') &&
        !domain.endsWith('.localhost')
      ) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Unapproved non-placeholder email domain: @${domain}`,
          match: fullEmail,
        });
      }
    }

    // Check: Indian phone numbers (strictly zero in production code)
    if (!relativePath.endsWith('password-policy.ts') && !relativePath.includes('test/')) {
      const phoneMatches = line.matchAll(/(?:\+91[\s-]?)?([6-9]\d{9})\b/g);
      for (const pm of phoneMatches) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'Prohibited phone number pattern found',
          match: pm[0],
        });
      }
    }
  }
}

function checkAuthPagesUseAuthLayout() {
  const authPages = [
    'apps/web/src/pages/LoginPage.tsx',
    'apps/web/src/pages/PlatformLoginPage.tsx',
    'apps/web/src/pages/ForgotPasswordPage.tsx',
    'apps/web/src/pages/ResetPasswordPage.tsx',
    'apps/web/src/pages/ForcePasswordResetPage.tsx',
  ];

  for (const pagePath of authPages) {
    const fullPath = path.resolve(ROOT, pagePath);
    if (!fs.existsSync(fullPath)) {
      violations.push({
        file: pagePath,
        line: 1,
        rule: 'Auth page missing from codebase',
        match: pagePath,
      });
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('AuthLayout')) {
      violations.push({
        file: pagePath,
        line: 1,
        rule: 'Auth page does not use AuthLayout',
        match: pagePath,
      });
    }
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'migrations' || entry.name === 'evidence') continue;
      walkDir(fullPath);
    } else if (entry.isFile()) {
      checkFile(fullPath);
    }
  }
}

console.log('========================================================================');
console.log('BRANDING & TENANT WHITE-LABEL INTEGRITY SCANNER (scan:branding)');
console.log('========================================================================\n');

for (const targetDir of TARGET_DIRECTORIES) {
  walkDir(path.resolve(ROOT, targetDir));
}

for (const targetFile of TARGET_FILES) {
  const fullPath = path.resolve(ROOT, targetFile);
  if (fs.existsSync(fullPath)) {
    checkFile(fullPath);
  }
}

checkAuthPagesUseAuthLayout();

console.log(`Scan completed across target directories and files.`);

if (violations.length > 0) {
  console.error(`\n[ERROR] FOUND ${violations.length} VIOLATION(S):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: [${v.rule}] -> "${v.match}"`);
  }
  console.error('\nPlease resolve all prohibited branding, real credentials, paths, or database files.\n');
  process.exit(1);
} else {
  console.log('\n[PASS] 0 violations found. Repository is 100% white-labeled and clean.\n');
  process.exit(0);
}
