/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

function verifyHtaccess(filePath) {
  console.log(`Checking .htaccess file: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`.htaccess file not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const requiredChecks = [
    {
      name: 'Content-Security-Policy header',
      regex: /Header\s+always\s+set\s+Content-Security-Policy\s+"([^"]+)"/i,
      validate: (match) => {
        const csp = match[1];
        if (!csp.includes("connect-src 'self' https://api.jsnc.co.in;")) {
          throw new Error('CSP missing exact connect-src: "connect-src \'self\' https://api.jsnc.co.in;"');
        }
        if (csp.includes('*.jsnc.co.in')) {
          throw new Error('CSP should not contain *.jsnc.co.in');
        }
        if (!csp.includes("img-src 'self' data: blob: https://api.jsnc.co.in;")) {
          throw new Error('CSP missing img-src without blanket https:');
        }
        if (!csp.includes('frame-ancestors \'none\'')) {
          throw new Error('CSP missing frame-ancestors \'none\'');
        }
        if (!csp.includes('sha256-')) {
          throw new Error('CSP script-src missing sha256 hash token');
        }
        return true;
      },
    },
    {
      name: 'X-Frame-Options DENY',
      regex: /Header\s+always\s+set\s+X-Frame-Options\s+"DENY"/i,
    },
    {
      name: 'X-Content-Type-Options nosniff',
      regex: /Header\s+always\s+set\s+X-Content-Type-Options\s+"nosniff"/i,
    },
    {
      name: 'Referrer-Policy no-referrer',
      regex: /Header\s+always\s+set\s+Referrer-Policy\s+"no-referrer"/i,
    },
    {
      name: 'Permissions-Policy header',
      regex: /Header\s+always\s+set\s+Permissions-Policy\s+"[^"]+"/i,
    },
    {
      name: 'Cache-Control no-cache for index.html',
      regex: /<FilesMatch\s+"index\\\.html\$">[\s\S]*?Header\s+set\s+Cache-Control\s+"[^"]*no-cache[^"]*"[\s\S]*?<\/FilesMatch>/i,
    },
  ];

  for (const check of requiredChecks) {
    const match = content.match(check.regex);
    if (!match) {
      throw new Error(`[FAIL] Required header missing or invalid: ${check.name}`);
    }
    if (check.validate) {
      check.validate(match);
    }
    console.log(` [PASS] ${check.name}`);
  }
}

function runAllChecks() {
  console.log('========================================================================');
  console.log('.HTACCESS SECURITY HEADERS PARSER & INTEGRITY CHECK');
  console.log('========================================================================\n');

  const files = [
    path.resolve(__dirname, '../apps/web/public/.htaccess'),
    path.resolve(__dirname, '../.htaccess'),
  ];

  let anyError = false;
  for (const f of files) {
    try {
      verifyHtaccess(f);
      console.log(`Successfully verified ${f}\n`);
    } catch (err) {
      console.error(`Verification error for ${f}: ${err.message}\n`);
      anyError = true;
    }
  }

  if (anyError) {
    console.error('[TEST FAILED] One or more .htaccess header assertions failed.');
    process.exit(1);
  } else {
    console.log('========================================================================');
    console.log('[ALL .HTACCESS CHECKS PASSED]');
    console.log('========================================================================');
  }
}

runAllChecks();
