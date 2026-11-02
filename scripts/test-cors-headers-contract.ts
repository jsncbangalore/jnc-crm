/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Automated Contract Test: Web Request Headers vs. API CORS Allowed Headers
 *
 * Scans apps/web/src for every custom request header and method sent by the frontend,
 * and asserts that every single one is explicitly permitted in the API's CORS configuration.
 * Fails fast if any header is missing.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
} from '../apps/api/src/common/cors-config';

const ROOT = path.resolve(__dirname, '..');
const WEB_SRC = path.resolve(ROOT, 'apps/web/src');

function getAllSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanWebHeaders(): { headers: Map<string, string[]>; methods: Set<string> } {
  const files = getAllSourceFiles(WEB_SRC);
  const foundHeaders = new Map<string, string[]>();
  const foundMethods = new Set<string>();

  const standardHttpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file).replace(/\\/g, '/');

    // 1. Detect headers in config objects: headers: { 'Header-Name': ... } or headers: { HeaderName: ... }
    const headerBlockRegex = /headers\s*:\s*\{([^}]+)\}/g;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = headerBlockRegex.exec(content)) !== null) {
      const blockContent = blockMatch[1];
      const lineRegex = /['"]?([a-zA-Z0-9_-]+)['"]?\s*:/g;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRegex.exec(blockContent)) !== null) {
        const headerName = lineMatch[1].trim();
        // Ignore JS object keys that are clearly not HTTP headers
        if (['common', 'data', 'params'].includes(headerName.toLowerCase())) continue;
        if (!foundHeaders.has(headerName)) foundHeaders.set(headerName, []);
        foundHeaders.get(headerName)!.push(relFile);
      }
    }

    // 2. Detect headers assignment: headers['Header-Name'] or headers.set('Header-Name')
    const bracketHeaderRegex = /headers(?:\.set\(|\[)\s*['"]([a-zA-Z0-9_-]+)['"]/g;
    let bracketMatch: RegExpExecArray | null;
    while ((bracketMatch = bracketHeaderRegex.exec(content)) !== null) {
      const headerName = bracketMatch[1].trim();
      if (!foundHeaders.has(headerName)) foundHeaders.set(headerName, []);
      foundHeaders.get(headerName)!.push(relFile);
    }

    // 3. Detect custom X- headers referenced anywhere in web source (e.g. errorHelper.ts checking x-request-id)
    const xHeaderRegex = /['"](x-[a-zA-Z0-9_-]+)['"]/gi;
    let xMatch: RegExpExecArray | null;
    while ((xMatch = xHeaderRegex.exec(content)) !== null) {
      const headerName = xMatch[1].trim();
      if (!foundHeaders.has(headerName)) foundHeaders.set(headerName, []);
      foundHeaders.get(headerName)!.push(relFile);
    }

    // 4. Detect api/axios method calls: api.get, api.post, etc.
    for (const method of standardHttpMethods) {
      const methodRegex = new RegExp(`\\b(?:api|axios|client)\\.${method}\\b`, 'i');
      if (methodRegex.test(content)) {
        foundMethods.add(method.toUpperCase());
      }
    }
  }

  return { headers: foundHeaders, methods: foundMethods };
}

export function runCorsContractTest(): boolean {
  console.log('='.repeat(70));
  console.log('   CORS CONTRACT VERIFICATION: WEB APP -> API ALLOWLIST');
  console.log('='.repeat(70));

  const { headers, methods } = scanWebHeaders();

  console.log(`[CORS TEST] Scanned ${WEB_SRC}`);
  console.log(`[CORS TEST] API Allowed Headers: ${CORS_ALLOWED_HEADERS.join(', ')}`);
  console.log(`[CORS TEST] API Allowed Methods: ${CORS_ALLOWED_METHODS.join(', ')}`);
  console.log(`[CORS TEST] API Exposed Headers: ${CORS_EXPOSED_HEADERS.join(', ')}`);
  console.log('-'.repeat(70));

  const allowedHeadersLower = new Set(CORS_ALLOWED_HEADERS.map((h) => h.toLowerCase()));
  const exposedHeadersLower = new Set(CORS_EXPOSED_HEADERS.map((h) => h.toLowerCase()));
  const allowedMethodsUpper = new Set(CORS_ALLOWED_METHODS.map((m) => m.toUpperCase()));

  let hasFailure = false;
  const missingHeaders: string[] = [];

  for (const [header, files] of headers.entries()) {
    const hLower = header.toLowerCase();
    const isAllowed = allowedHeadersLower.has(hLower) || exposedHeadersLower.has(hLower);

    if (!isAllowed) {
      hasFailure = true;
      missingHeaders.push(header);
      console.error(`❌ [MISSING IN CORS] Header "${header}" is sent by frontend but missing from API CORS list:`);
      files.forEach((f) => console.error(`     at ${f}`));
    } else {
      console.log(`✅ [OK] Header "${header}" is permitted by API CORS.`);
    }
  }

  const missingMethods: string[] = [];
  for (const method of methods) {
    if (!allowedMethodsUpper.has(method)) {
      hasFailure = true;
      missingMethods.push(method);
      console.error(`❌ [MISSING METHOD] HTTP Method "${method}" used by frontend is not in API CORS methods!`);
    } else {
      console.log(`✅ [OK] HTTP Method "${method}" is permitted by API CORS.`);
    }
  }

  console.log('='.repeat(70));
  if (hasFailure) {
    console.error(`❌ CORS CONTRACT TEST FAILED!`);
    console.error(`Missing headers: ${missingHeaders.join(', ') || 'none'}`);
    console.error(`Missing methods: ${missingMethods.join(', ') || 'none'}`);
    return false;
  }

  console.log('✅ ALL FRONTEND REQUEST HEADERS AND METHODS ARE COVERED BY API CORS CONFIG!');
  console.log('='.repeat(70));
  return true;
}

if (require.main === module) {
  const success = runCorsContractTest();
  process.exit(success ? 0 : 1);
}
