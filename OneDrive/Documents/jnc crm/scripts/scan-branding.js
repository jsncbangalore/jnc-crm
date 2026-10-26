/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

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
  '.tsbuildinfo',
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

// Sample person and company names historically used
const PROHIBITED_SAMPLE_NAMES = [
  ['Rajesh', 'Sharma'].join(' '),
  ['Priya', 'Patel'].join(' '),
  ['Vikram', 'Sundaram'].join(' '),
  ['Vikram', 'Seth'].join(' '),
  ['Rajesh', 'Kumar'].join(' '),
  ['Ramesh', 'Patel'].join(' '),
  ['Sharma', 'Tooling'].join(' '),
  ['Nexus', 'Tech'].join(' '),
  ['Apex', 'Metro'].join(' '),
  ['Rajesh', 'Electronics'].join(' '),
  ['Priya', 'Nair'].join(' '),
  ['Tom', 'Reeves'].join(' '),
  ['Ana', 'Silva'].join(' '),
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
  'localhost',
]);

// Load Brand Name Allowlist
const ALLOWLIST_FILE = path.resolve(ROOT, 'scripts/brand-allowlist.json');
let allowedBrandFiles = [];
if (fs.existsSync(ALLOWLIST_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
    allowedBrandFiles = parsed.allowedFilesForBrandName || [];
  } catch (err) {
    console.error(`[WARN] Failed to parse brand-allowlist.json: ${err.message}`);
  }
}

function isBrandAllowed(relativePath) {
  const norm = relativePath.replace(/\\/g, '/');
  return allowedBrandFiles.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(norm);
    }
    return norm === pattern;
  });
}

let violations = [];

function checkContent(relativePath, content) {
  // Exclude third-party Axios library fallback string in minified web bundles
  const sanitizedContent = content.replace(
    /window\.location\.href\s*\|\|\s*["']http:\/\/localhost["']/g,
    ''
  );

  const lines = sanitizedContent.split('\n');
  const isWebDist = relativePath.startsWith('apps/web/dist');
  const isWebSrc = relativePath.startsWith('apps/web/src') || relativePath.startsWith('apps/web/public');
  const isWeb = isWebDist || isWebSrc;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // 1. Prohibited Keywords
    if (lowerLine.includes(KW_JSNC)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_JSNC}' prohibited`,
        match: line.slice(0, 100).trim(),
      });
    }

    if (lowerLine.includes(KW_JS_NET)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_JS_NET}' prohibited`,
        match: line.slice(0, 100).trim(),
      });
    }

    if (lowerLine.includes(KW_RESEND_DEV)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Keyword '${KW_RESEND_DEV}' prohibited`,
        match: line.slice(0, 100).trim(),
      });
    }

    if (lowerLine.includes(KW_JAYARAJ)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited name found: '${KW_JAYARAJ}'`,
        match: line.slice(0, 100).trim(),
      });
    }

    if (lowerLine.includes(KW_SANTHOSH)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited name found: '${KW_SANTHOSH}'`,
        match: line.slice(0, 100).trim(),
      });
    }

    if (line.includes(KW_LUT_BOND)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Prohibited credential/identifier found: '${KW_LUT_BOND}'`,
        match: line.slice(0, 100).trim(),
      });
    }

    // 2. Prohibited competitor / deprecated brand names
    for (const term of PROHIBITED_TERMS) {
      if (lowerLine.includes(term)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Prohibited word/brand '${term}' found`,
          match: line.slice(0, 100).trim(),
        });
      }
    }

    // 3. Brand & Company Name (Allowed ONLY in allowlisted files)
    const BRAND_MATCH = /\bJNC\s+CRM\b|\bJNC\b/g;
    if (BRAND_MATCH.test(line)) {
      if (!isBrandAllowed(relativePath)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'Brand or Company name is only permitted in allowlisted brand config, public index page, and legal pages',
          match: line.slice(0, 100).trim(),
        });
      }
    }

    // 4. Sample Person and Company Names
    for (const sampleName of PROHIBITED_SAMPLE_NAMES) {
      if (line.includes(sampleName)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Prohibited sample name '${sampleName}' found`,
          match: line.slice(0, 100).trim(),
        });
      }
    }

    // 5. Invented Statistics Claims (e.g. 35%)
    if (/\b35%/.test(line)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Unverified statistics claim ('35%') prohibited`,
        match: line.slice(0, 100).trim(),
      });
    }

    // 6. Developer Tunnel instructions
    if (line.includes('cloudflared')) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: `Developer tunnel tool 'cloudflared' prohibited`,
        match: line.slice(0, 100).trim(),
      });
    }

    // In web source & web dist: no 127.0.0.1 or localhost (outside library code)
    if (isWeb) {
      if (line.includes('127.0.0.1')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Local IP '127.0.0.1' prohibited in web client code`,
          match: line.slice(0, 100).trim(),
        });
      }
      if (line.includes('localhost') && !line.includes('window.location.href')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: `Literal 'localhost' prohibited in web client code`,
          match: line.slice(0, 100).trim(),
        });
      }
    }

    // 7. Local Windows user paths
    if (line.includes(KW_JNC_RD) || line.includes(KW_JNC_RD_SLASH) || (line.includes('Users') && line.includes('JNC R&D'))) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'Local Windows user path prohibited',
        match: line.slice(0, 100).trim(),
      });
    }

    // 8. Fake Testimonial Patterns
    for (const pat of FAKE_TESTIMONIAL_PATTERNS) {
      if (pat.test(line)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'Fake testimonial pattern found',
          match: line.slice(0, 100).trim(),
        });
      }
    }

    // 9. Real or unapproved Email addresses
    const emailMatches = line.matchAll(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g);
    for (const em of emailMatches) {
      const fullEmail = em[0].toLowerCase();
      const domain = em[2].toLowerCase();

      // Check URL database connection string exclusions
      const atIdx = em.index;
      const beforeAt = line.substring(Math.max(0, atIdx - 30), atIdx);
      if (beforeAt.includes('://') || beforeAt.includes('postgres') || beforeAt.includes('http')) {
        continue;
      }

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
          rule: `Unapproved non-example email domain: @${domain}`,
          match: fullEmail,
        });
      }
    }

    // 10. Phone numbers in any format (+91 98765 43210, 98765-43210, spaces, etc.)
    if (
      !relativePath.endsWith('password-policy.ts') &&
      !relativePath.endsWith('password-policy.js') &&
      !relativePath.includes('test/')
    ) {
      if (isWebDist || relativePath.includes('.zip!')) {
        // In built bundles: detect formatted phone numbers (+91 98765 43210, 98765-43210, 98765 43210)
        // or quoted phone strings ("+91..." or "9876543210")
        const bundlePhoneMatches = line.matchAll(/(?:["'`])(?:\+91[\s-]?)?[6-9]\d{9}(?:["'`])|(?:\+91[\s-]?)?[6-9]\d{4}[\s-]\d{5}\b/g);
        for (const pm of bundlePhoneMatches) {
          violations.push({
            file: relativePath,
            line: lineNum,
            rule: 'Prohibited phone number pattern found in bundle',
            match: pm[0],
          });
        }
      } else {
        // In source files: detect any 10-digit mobile or formatted phone number
        const phoneMatches = line.matchAll(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?[0-9]{5}\b/g);
        for (const pm of phoneMatches) {
          if (pm[0].length >= 10 && pm[0].length <= 15) {
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
  }
}

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

  // Skip binary/media files
  if (IGNORE_EXTENSIONS.has(ext)) return;

  // Skip self & bad fixture test
  if (path.basename(filePath) === 'scan-branding.js' || path.basename(filePath) === 'test-scan-fixtures.js') return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  checkContent(relativePath, content);
}

function scanBuiltOutputs() {
  console.log('[BUILT OUTPUT SCAN] Checking built web dist and API bundle...');

  // A. Scan apps/web/dist
  const webDistDir = path.resolve(ROOT, 'apps/web/dist');
  if (fs.existsSync(webDistDir)) {
    console.log('  -> Scanning apps/web/dist ...');
    walkDir(webDistDir, true);
  }

  // B. Scan deploy-release/api-bundle.zip if exists
  const apiZipPath = path.resolve(ROOT, 'deploy-release/api-bundle.zip');
  if (fs.existsSync(apiZipPath)) {
    console.log('  -> Scanning deploy-release/api-bundle.zip ...');
    try {
      const zip = new AdmZip(apiZipPath);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const name = entry.entryName;
        const ext = path.extname(name).toLowerCase();
        if (IGNORE_EXTENSIONS.has(ext)) continue;

        const text = entry.getData().toString('utf8');
        checkContent(`deploy-release/api-bundle.zip!${name}`, text);
      }
    } catch (err) {
      violations.push({
        file: 'deploy-release/api-bundle.zip',
        line: 1,
        rule: 'Failed to inspect API bundle zip',
        match: err.message,
      });
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

function walkDir(dir, includeDist = false) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'migrations' || entry.name === 'evidence') continue;
      if (!includeDist && entry.name === 'dist') continue;
      walkDir(fullPath, includeDist);
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
scanBuiltOutputs();

console.log(`\nScan completed across target source and built distribution files.`);

if (violations.length > 0) {
  console.error(`\n[ERROR] FOUND ${violations.length} VIOLATION(S):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: [${v.rule}] -> "${v.match}"`);
  }
  console.error('\nPlease resolve all prohibited branding, real credentials, paths, or database files.\n');
  process.exit(1);
} else {
  console.log('\n[PASS] 0 violations found. Repository and built outputs are 100% compliant.\n');
  process.exit(0);
}
