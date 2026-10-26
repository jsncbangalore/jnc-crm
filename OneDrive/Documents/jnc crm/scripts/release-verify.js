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
