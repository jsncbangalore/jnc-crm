/**
 * Automated CORS Contract Test
 * Scans apps/web/src for all request headers and HTTP methods sent by the web application,
 * and asserts that every single one is explicitly permitted in apps/api/src/common/cors-config.ts.
 * Fails with a nonzero exit code if any header or method is missing.
 */

const fs = require('fs');
const path = require('path');

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractHeadersFromWeb(webDir) {
  const files = getAllFiles(webDir);
  const foundHeaders = new Set();
  const foundMethods = new Set();

  const headerPatterns = [
    /headers:\s*\{([^}]+)\}/g,
    /config\.headers\[['"]([^'"]+)['"]\]/g,
    /headers\[['"]([^'"]+)['"]\]/g,
    /headers:\s*\{\s*['"]([^'"]+)['"]/g,
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // Method detection
    const methodMatches = content.matchAll(/api\.(get|post|put|patch|delete)\s*[\(<]/gi);
    for (const match of methodMatches) {
      foundMethods.add(match[1].toUpperCase());
    }
    const axiosMatches = content.matchAll(/axios\.(get|post|put|patch|delete)\s*[\(<]/gi);
    for (const match of axiosMatches) {
      foundMethods.add(match[1].toUpperCase());
    }

    // Direct header references
    for (const pattern of headerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const block = match[1];
        // Extract keys
        const keyMatches = block.matchAll(/['"]([a-zA-Z0-9\-_]+)['"]\s*:/g);
        for (const km of keyMatches) {
          foundHeaders.add(km[1]);
        }
        if (!block.includes(':')) {
          foundHeaders.add(block.trim());
        }
      }
    }

    // Direct string matches for known custom headers
    const knownCustom = [
      'X-Requested-With',
      'X-Expected-User-Id',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Request-Id',
      'X-App-Version',
      'X-Client-Version',
      'X-IndiaMart-Token',
      'Range',
      'Content-Type',
      'Authorization',
      'Accept',
    ];

    for (const h of knownCustom) {
      if (content.includes(h) || content.includes(h.toLowerCase())) {
        foundHeaders.add(h);
      }
    }
  }

  return { foundHeaders: Array.from(foundHeaders), foundMethods: Array.from(foundMethods) };
}

function extractCorsConfig(apiConfigFile) {
  const content = fs.readFileSync(apiConfigFile, 'utf8');

  // Extract CORS_ALLOWED_HEADERS
  const headersMatch = content.match(/export const CORS_ALLOWED_HEADERS = \[([\s\S]*?)\];/);
  if (!headersMatch) {
    throw new Error('Could not find CORS_ALLOWED_HEADERS in ' + apiConfigFile);
  }
  const allowedHeaders = headersMatch[1]
    .split('\n')
    .map((l) => l.trim().replace(/[',]/g, ''))
    .filter(Boolean);

  // Extract CORS_ALLOWED_METHODS
  const methodsMatch = content.match(/export const CORS_ALLOWED_METHODS = \[([\s\S]*?)\];/);
  if (!methodsMatch) {
    throw new Error('Could not find CORS_ALLOWED_METHODS in ' + apiConfigFile);
  }
  const allowedMethods = methodsMatch[1]
    .split('\n')
    .map((l) => l.trim().replace(/[',]/g, ''))
    .filter(Boolean);

  return { allowedHeaders, allowedMethods };
}

function run() {
  console.log('=== CORS CONTRACT TEST ===');
  const webDir = path.resolve(__dirname, '../apps/web/src');
  const corsConfigFile = path.resolve(__dirname, '../apps/api/src/common/cors-config.ts');

  const { foundHeaders, foundMethods } = extractHeadersFromWeb(webDir);
  const { allowedHeaders, allowedMethods } = extractCorsConfig(corsConfigFile);

  console.log('Detected web headers (' + foundHeaders.length + '):', foundHeaders);
  console.log('Detected web HTTP methods (' + foundMethods.length + '):', foundMethods);

  const allowedHeadersLower = new Set(allowedHeaders.map((h) => h.toLowerCase()));
  const allowedMethodsSet = new Set(allowedMethods.map((m) => m.toUpperCase()));

  const missingHeaders = [];
  for (const h of foundHeaders) {
    // Ignore internal or non-HTTP headers
    if (['undefined', 'object', 'row', 'data', 'errors'].includes(h.toLowerCase())) continue;
    if (!allowedHeadersLower.has(h.toLowerCase())) {
      missingHeaders.push(h);
    }
  }

  const missingMethods = [];
  for (const m of foundMethods) {
    if (!allowedMethodsSet.has(m)) {
      missingMethods.push(m);
    }
  }

  let failed = false;

  if (missingHeaders.length > 0) {
    console.error('FAILED: The following headers sent by the web app are missing from API CORS allowedHeaders:');
    missingHeaders.forEach((h) => console.error('  - ' + h));
    failed = true;
  } else {
    console.log('PASS: All web request headers are included in API CORS allowedHeaders.');
  }

  if (missingMethods.length > 0) {
    console.error('FAILED: The following HTTP methods used by the web app are missing from API CORS allowedMethods:');
    missingMethods.forEach((m) => console.error('  - ' + m));
    failed = true;
  } else {
    console.log('PASS: All web HTTP methods are included in API CORS allowedMethods.');
  }

  if (failed) {
    process.exit(1);
  }
  console.log('CORS contract test passed successfully.');
}

run();
