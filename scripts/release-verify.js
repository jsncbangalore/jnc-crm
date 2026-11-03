#!/usr/bin/env node
/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Release Verification Script (npm run release:verify)
 *
 * Verifies that a target API deployment is running and satisfies
 * the minimum REQUIRED_API_VERSION expected by the frontend website build.
 *
 * Usage:
 *   node scripts/release-verify.js [target_url]
 *   npm run release:verify -- [target_url]
 *
 * Example:
 *   node scripts/release-verify.js http://localhost:3333/api/v1
 *   node scripts/release-verify.js https://api.example.com/api/v1
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 1. Determine Required Version from web constants
function getRequiredApiVersion() {
  const versionFile = path.join(__dirname, '..', 'apps', 'web', 'src', 'constants', 'version.ts');
  try {
    const content = fs.readFileSync(versionFile, 'utf8');
    const match = content.match(/REQUIRED_API_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {}
  return '1.1.0';
}

// 2. Semver comparator
function compareSemver(v1, v2) {
  const parse = (v) =>
    (v || '0.0.0')
      .replace(/^v/i, '')
      .split('.')
      .map((seg) => parseInt(seg, 10) || 0);

  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

// 3. Simple HTTP GET helper
function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(
      urlStr,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ReleaseVerifier/1.1.0',
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
            } catch (err) {
              reject(new Error(`Failed to parse JSON response: ${err.message}`));
            }
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode} ${res.statusMessage || ''}: ${data.substring(0, 200)}`
              )
            );
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 10 seconds'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// 4. Send OPTIONS Preflight with custom headers to verify CORS contract
function verifyCorsPreflight(baseUrl) {
  const preflightUrl = `${baseUrl}/payments`;
  const customHeaders = [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'X-Expected-User-Id',
    'Idempotency-Key',
    'idempotency-key',
    'X-Idempotency-Key',
    'x-idempotency-key',
    'X-Request-Id',
    'x-request-id',
    'X-App-Version',
    'X-Client-Version',
    'X-IndiaMart-Token',
    'Range',
  ];

  console.log(` [PREFLIGHT] Testing CORS OPTIONS preflight to: ${preflightUrl}`);
  const parsed = new URL(preflightUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      preflightUrl,
      {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': customHeaders.join(', '),
        },
        timeout: 10000,
      },
      (res) => {
        const allowHeadersRaw = res.headers['access-control-allow-headers'] || '';
        const allowed = allowHeadersRaw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
        const allowOrigin = res.headers['access-control-allow-origin'];
        const allowMethods = res.headers['access-control-allow-methods'] || '';

        console.log(` [PREFLIGHT] HTTP ${res.statusCode} | Allow-Origin: ${allowOrigin || 'none'}`);
        console.log(` [PREFLIGHT] Allow-Methods: ${allowMethods || 'none'}`);
        console.log(` [PREFLIGHT] Allow-Headers: ${allowHeadersRaw || 'none'}`);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Preflight rejected with status ${res.statusCode}`));
        }

        const missing = customHeaders.filter((h) => !allowed.includes(h.toLowerCase()));
        if (missing.length > 0) {
          return reject(new Error(`Preflight response does not allow headers: ${missing.join(', ')}`));
        }

        const requiredMethods = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET'];
        const allowedMethodsUpper = allowMethods.split(',').map((m) => m.trim().toUpperCase());
        const missingMethods = requiredMethods.filter((m) => !allowedMethodsUpper.includes(m));
        if (missingMethods.length > 0) {
          return reject(new Error(`Preflight response does not allow methods: ${missingMethods.join(', ')}`));
        }

        console.log(' [SUCCESS] All custom request headers and methods are permitted by target CORS preflight.');
        resolve();
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Preflight request timed out after 10 seconds'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const rawTarget =
    process.argv[2] ||
    process.env.TARGET_API_URL ||
    process.env.API_URL ||
    'http://localhost:3333/api/v1';

  let baseUrl = rawTarget.replace(/\/+$/, '');
  const requiredVersion = getRequiredApiVersion();

  console.log('='.repeat(65));
  console.log('   CRM RELEASE COMPATIBILITY VERIFICATION');
  console.log('='.repeat(65));
  console.log(` Target API Base : ${baseUrl}`);
  console.log(` Required Version: ${requiredVersion}`);

  // Step 0: React rules-of-hooks AST verification
  console.log(' [VERIFY] Running React hooks AST scanner (scripts/scan-hooks.js)...');
  try {
    const { execSync } = require('child_process');
    execSync('node scripts/scan-hooks.js apps/web/src', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log(' [SUCCESS] React rules-of-hooks scanner passed with 0 violations.');
  } catch (err) {
    console.error(' [FAIL] React rules-of-hooks violations detected! Deployment blocked.');
    process.exit(1);
  }

  // Resolve health URL: try /health if path contains /api/v1, or /api/v1/health if root
  let healthUrl = baseUrl.endsWith('/health')
    ? baseUrl
    : baseUrl.endsWith('/api/v1')
    ? `${baseUrl}/health`
    : `${baseUrl}/api/v1/health`;

  console.log(` Health Endpoint : ${healthUrl}`);
  console.log('-'.repeat(65));

  try {
    const result = await fetchJson(healthUrl);
    const body = result.body || {};
    const apiVersion = body.apiVersion || body.version || '1.0.0';
    const status = body.status || 'unknown';
    const features = Array.isArray(body.features) ? body.features.join(', ') : 'none reported';

    console.log(` [RESPONSE] HTTP ${result.statusCode}`);
    console.log(` API Version     : ${apiVersion}`);
    console.log(` API Status      : ${status}`);
    console.log(` Features        : ${features}`);
    console.log('-'.repeat(65));

    const cmp = compareSemver(apiVersion, requiredVersion);

    if (cmp < 0) {
      console.error(
        ` [FAIL] Target API version (${apiVersion}) is older than the frontend website's required version (${requiredVersion}).`
      );
      console.error(
        ' -> The backend must be migrated and deployed before deploying the new website!'
      );
      process.exit(1);
    }

    console.log(
      ` [SUCCESS] Target API version (${apiVersion}) meets or exceeds required version (${requiredVersion}).`
    );
    console.log('-'.repeat(65));

    // Verify CORS Preflight contract
    await verifyCorsPreflight(baseUrl);

    console.log(' -> System is compatible for website release deployment.');
    console.log('='.repeat(65));
    process.exit(0);
  } catch (err) {
    console.error(` [FAIL] Target API health check failed: ${err.message}`);
    console.error(
      ' -> The target API is unreachable or missing the /health contract endpoint.'
    );
    console.error(
      ' -> DO NOT deploy the website until the backend is online and /health returns 200 OK.'
    );
    console.log('='.repeat(65));
    process.exit(1);
  }
}

run();
