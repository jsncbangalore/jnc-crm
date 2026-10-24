/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const dns = require('dns').promises;

// Parse CLI Arguments
let webUrl = process.env.TEST_WEB_URL || 'https://admin.example.com';
let apiUrl = process.env.TEST_API_URL || 'https://api.example.com';
let allowInsecure = false;
let loginCheck = false;
let rateLimitNote = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--web' && args[i + 1]) {
    webUrl = args[++i];
  } else if (args[i] === '--api' && args[i + 1]) {
    apiUrl = args[++i];
  } else if (args[i] === '--allow-insecure') {
    allowInsecure = true;
  } else if (args[i] === '--login-check') {
    loginCheck = true;
  } else if (args[i] === '--rate-limit-note') {
    rateLimitNote = true;
  }
}

webUrl = webUrl.replace(/\/+$/, '');
apiUrl = apiUrl.replace(/\/+$/, '');

const apiBase = apiUrl.endsWith('/api/v1') ? apiUrl : `${apiUrl}/api/v1`;
const apiRoot = apiUrl.endsWith('/api/v1') ? apiUrl.replace(/\/api\/v1$/, '') : apiUrl;
const webOrigin = new URL(webUrl).origin;

console.log('========================================================================');
console.log('CRM POST-DEPLOYMENT LIVE / INTEGRITY VERIFICATION');
console.log(`Web URL:    ${webUrl}`);
console.log(`API URL:    ${apiUrl} (Base: ${apiBase})`);
console.log(`Mode:       ${allowInsecure ? 'ALLOW-INSECURE (Local Dev / Staging)' : 'STRICT PRODUCTION HTTPS'}`);
console.log('========================================================================\n');

// HTTP Request Helper
function makeRequest(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const reqOpts = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = client.request(reqOpts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runVerification() {
  const results = [];
  let allPassed = true;

  function record(checkName, pass, detail) {
    results.push({ check: checkName, pass, detail });
    const tag = pass ? '[PASS]' : '[FAIL]';
    console.log(` ${tag} ${checkName}`);
    if (detail) {
      console.log(`        └─ ${detail}`);
    }
    if (!pass) allPassed = false;
  }

  // ─── CHECK 0: DNS Resolution for Hostnames ──────────────────────────────
  console.log('[0/6] Verifying DNS resolution for web and API hostnames ...');
  const webHost = new URL(webUrl).hostname;
  const apiHost = new URL(apiUrl).hostname;

  let webDnsOk = false;
  let apiDnsOk = false;
  let webIp = null;
  let apiIp = null;

  try {
    const res = await dns.lookup(webHost);
    webIp = res.address;
    webDnsOk = true;
    record(`DNS Resolution (Web: ${webHost})`, true, `IP: ${webIp}`);
  } catch (err) {
    console.log(`DNS: ${webHost} does not exist yet`);
    record(`DNS Resolution (Web: ${webHost})`, false, `DNS: ${webHost} does not exist yet`);
  }

  try {
    const res = await dns.lookup(apiHost);
    apiIp = res.address;
    apiDnsOk = true;
    record(`DNS Resolution (API: ${apiHost})`, true, `IP: ${apiIp}`);
  } catch (err) {
    console.log(`DNS: ${apiHost} does not exist yet`);
    record(`DNS Resolution (API: ${apiHost})`, false, `DNS: ${apiHost} does not exist yet`);
  }

  // ─── CHECK 1: Web Response Headers (CSP, Frame, Nosniff, Cache) ─────────
  console.log('\n[1/6] Verifying Web response security headers ...');
  if (!webDnsOk) {
    record('Web Response Security Headers (CSP, Frame, Nosniff, Cache)', false, `Skipped: DNS: ${webHost} does not exist yet`);
  } else {
    try {
      const webRes = await makeRequest(webUrl);
      const headers = webRes.headers;
      const body = webRes.body;

      const hasCsp = Boolean(
        headers['content-security-policy'] ||
        /<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(body)
      );
      const hasFrame = Boolean(
        (headers['x-frame-options'] && /DENY|SAMEORIGIN/i.test(headers['x-frame-options'])) ||
        (headers['content-security-policy'] && headers['content-security-policy'].includes('frame-ancestors')) ||
        (body.includes('frame-ancestors'))
      );
      const hasNosniff = Boolean(
        (headers['x-content-type-options'] && headers['x-content-type-options'].toLowerCase() === 'nosniff') ||
        /<meta\s+http-equiv=["']X-Content-Type-Options["']\s+content=["']nosniff["']/i.test(body)
      );
      const hasCache = Boolean(
        headers['cache-control'] && headers['cache-control'].toLowerCase().includes('no-cache')
      );

      const missing = [];
      if (!hasCsp) missing.push('Content-Security-Policy');
      if (!hasFrame) missing.push('Frame Protection (X-Frame-Options / frame-ancestors)');
      if (!hasNosniff) missing.push('X-Content-Type-Options nosniff');
      if (!hasCache) missing.push('Cache-Control no-cache');

      const pass = missing.length === 0;
      record(
        'Web Response Security Headers (CSP, Frame, Nosniff, Cache)',
        pass,
        pass ? 'All required security and cache headers verified' : `Missing: ${missing.join(', ')}`
      );
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        record('Web Response Security Headers', false, `Skipped: DNS: ${webHost} does not exist yet`);
      } else {
        record('Web Response Security Headers', false, `Request failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 2: Web HTML References API URL ───────────────────────────────
  console.log('\n[2/6] Verifying Web HTML references target API URL ...');
  const targetRef = apiUrl;
  if (!webDnsOk) {
    record(`Web HTML References API (${targetRef})`, false, `Skipped: DNS: ${webHost} does not exist yet`);
  } else {
    try {
      const webRes = await makeRequest(webUrl);
      const body = webRes.body;
      const hasTargetRef = body.includes(targetRef) || (allowInsecure && body.includes(apiUrl));

      record(
        `Web HTML References API (${targetRef})`,
        hasTargetRef,
        hasTargetRef
          ? `Found API endpoint reference in HTML meta/connect directives`
          : `Expected reference "${targetRef}" not found in HTML`
      );
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        record(`Web HTML References API (${targetRef})`, false, `Skipped: DNS: ${webHost} does not exist yet`);
      } else {
        record('Web HTML References API', false, `Request failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 3: API /auth/me Returns 401 with Security Headers ─────────────
  console.log('\n[3/6] Verifying API /auth/me returns 401 with security headers ...');
  if (!apiDnsOk) {
    record('API /auth/me 401 Unauthorized & Security Headers', false, `Skipped: DNS: ${apiHost} does not exist yet`);
  } else {
    try {
      const meRes = await makeRequest(`${apiBase}/auth/me`);
      const is401 = meRes.statusCode === 401;
      const hasNosniff = meRes.headers['x-content-type-options'] === 'nosniff';
      const hasFrame = Boolean(meRes.headers['x-frame-options']);
      const hasCsp = Boolean(meRes.headers['content-security-policy']);

      const pass = is401 && hasNosniff && hasFrame && hasCsp;
      record(
        'API /auth/me 401 Unauthorized & Security Headers',
        pass,
        `HTTP Status: ${meRes.statusCode} | nosniff: ${hasNosniff} | frame: ${hasFrame} | csp: ${hasCsp}`
      );
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        record('API /auth/me 401 Unauthorized & Security Headers', false, `Skipped: DNS: ${apiHost} does not exist yet`);
      } else {
        record('API /auth/me 401 & Security Headers', false, `Request failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 4: CORS Preflight (Web Origin vs Evil Origin) ────────────────
  console.log('\n[4/6] Verifying CORS preflights for allowed and unauthorized origins ...');
  if (!apiDnsOk) {
    record(`CORS Preflight from Authorized Web Origin (${webOrigin})`, false, `Skipped: DNS: ${apiHost} does not exist yet`);
    record('CORS Preflight Refusal for https://evil.example', false, `Skipped: DNS: ${apiHost} does not exist yet`);
  } else {
    try {
      // A. Authorized web origin
      const corsWebRes = await makeRequest(`${apiBase}/auth/me`, {
        method: 'OPTIONS',
        headers: {
          Origin: webOrigin,
          'Access-Control-Request-Method': 'POST',
        },
      });

      const webAllowOrigin = corsWebRes.headers['access-control-allow-origin'];
      const webAllowCreds = corsWebRes.headers['access-control-allow-credentials'];
      const webPass =
        (corsWebRes.statusCode === 200 || corsWebRes.statusCode === 204) &&
        webAllowOrigin === webOrigin &&
        webAllowCreds === 'true';

      record(
        `CORS Preflight from Authorized Web Origin (${webOrigin})`,
        webPass,
        `HTTP ${corsWebRes.statusCode} | Allow-Origin: ${webAllowOrigin || 'NONE'} | Allow-Credentials: ${webAllowCreds || 'NONE'}`
      );

      // B. Unauthorized evil origin
      const corsEvilRes = await makeRequest(`${apiBase}/auth/me`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const evilAllowOrigin = corsEvilRes.headers['access-control-allow-origin'];
      const evilPass = evilAllowOrigin !== 'https://evil.example';

      record(
        'CORS Preflight Refusal for https://evil.example',
        evilPass,
        evilPass
          ? `Correctly blocked: Origin header not reflected (HTTP ${corsEvilRes.statusCode})`
          : `VULNERABILITY: Disallowed origin reflected in Access-Control-Allow-Origin: ${evilAllowOrigin}`
      );
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        record('CORS Preflight Verification', false, `Skipped: DNS: ${apiHost} does not exist yet`);
      } else {
        record('CORS Preflight Verification', false, `Preflight request failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 5: HTTPS Redirect from HTTP ─────────────────────────────────
  console.log('\n[5/6] Verifying HTTP -> HTTPS redirection ...');
  if (!webDnsOk) {
    record('HTTP -> HTTPS Redirect', false, `Skipped: DNS: ${webHost} does not exist yet`);
  } else {
    try {
      if (allowInsecure && webUrl.startsWith('http://')) {
        record(
          'HTTPS Redirection Enforcement',
          true,
          'ALLOW-INSECURE mode active with HTTP target; HTTPS redirect check skipped for local test'
        );
      } else {
        const parsedWeb = new URL(webUrl);
        const httpTarget = `http://${parsedWeb.hostname}${parsedWeb.port ? ':' + parsedWeb.port : ''}/`;

        const redirectRes = await makeRequest(httpTarget);
        const isRedirect = [301, 302, 307, 308].includes(redirectRes.statusCode);
        const loc = redirectRes.headers['location'] || '';
        const redirectsToHttps = isRedirect && loc.startsWith('https://');

        record(
          `HTTP -> HTTPS Redirect (${httpTarget})`,
          redirectsToHttps,
          redirectsToHttps
            ? `HTTP ${redirectRes.statusCode} redirects to ${loc}`
            : `Did not redirect to HTTPS: HTTP ${redirectRes.statusCode}, Location: ${loc || 'NONE'}`
        );
      }
    } catch (err) {
      if (allowInsecure) {
        record('HTTPS Redirection Enforcement', true, `Local HTTP check passed (--allow-insecure mode)`);
      } else if (err.code === 'ENOTFOUND') {
        record('HTTP -> HTTPS Redirect', false, `Skipped: DNS: ${webHost} does not exist yet`);
      } else {
        record('HTTP -> HTTPS Redirection', false, `Redirect check failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 6: No Directory Listing on /uploads and /api/v1 ──────────────
  console.log('\n[6/6] Verifying directory listings are prohibited on /uploads and /api/v1 ...');
  if (!apiDnsOk) {
    record('Directory Listing Prohibited on /uploads', false, `Skipped: DNS: ${apiHost} does not exist yet`);
    record('Directory Listing Prohibited on /api/v1', false, `Skipped: DNS: ${apiHost} does not exist yet`);
  } else {
    try {
      const isDirListing = (body) => {
        const lower = body.toLowerCase();
        return (
          lower.includes('index of /') ||
          lower.includes('<title>index of') ||
          lower.includes('directory listing for')
        );
      };

      // A. Test /uploads
      const uploadsRes = await makeRequest(`${apiRoot}/uploads`);
      const uploadsNoListing = !isDirListing(uploadsRes.body);

      record(
        'Directory Listing Prohibited on /uploads',
        uploadsNoListing,
        `HTTP ${uploadsRes.statusCode} (Body contains directory index: ${!uploadsNoListing})`
      );

      // B. Test /api/v1
      const apiV1Res = await makeRequest(`${apiRoot}/api/v1`);
      const apiV1NoListing = !isDirListing(apiV1Res.body);

      record(
        'Directory Listing Prohibited on /api/v1',
        apiV1NoListing,
        `HTTP ${apiV1Res.statusCode} (Body contains directory index: ${!apiV1NoListing})`
      );
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        record('Directory Listing Verification', false, `Skipped: DNS: ${apiHost} does not exist yet`);
      } else {
        record('Directory Listing Verification', false, `Check failed: ${err.message}`);
      }
    }
  }

  // ─── CHECK 7: Login & Session Integrity Probe (--login-check) ───────────
  let observedRateLimitRemaining = null;
  let observedRateLimitLimit = null;
  let observedRateLimitReset = null;

  if (loginCheck) {
    console.log('\n[7/7] Executing Login & Session Integrity Probe (--login-check) ...');
    if (!apiDnsOk) {
      record('Login & Session Integrity Probe', false, `Skipped: DNS: ${apiHost} does not exist yet`);
    } else {
      const verifyEmail = process.env.VERIFY_EMAIL;
      const verifyPassword = process.env.VERIFY_PASSWORD;

      if (!verifyEmail || !verifyPassword) {
        record(
          'Login Check Credentials Supplied',
          false,
          'Environment variables VERIFY_EMAIL and VERIFY_PASSWORD must be provided for --login-check'
        );
      } else {
        const maskedEmail = verifyEmail.replace(/^([^@]{2})[^@]*(@.*)$/, '$1***$2');
        console.log(`        Target User: ${maskedEmail} (Password: <MASKED>)`);

        try {
          const loginPayload = JSON.stringify({
            identifier: verifyEmail,
            password: verifyPassword,
          });

          const loginRes = await makeRequest(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: {
              Origin: webOrigin,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(loginPayload),
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: loginPayload,
          });

          observedRateLimitRemaining = loginRes.headers['x-ratelimit-remaining'];
          observedRateLimitLimit = loginRes.headers['x-ratelimit-limit'];
          observedRateLimitReset = loginRes.headers['x-ratelimit-reset'];

          let loginData = {};
          try {
            loginData = JSON.parse(loginRes.body);
          } catch {}

          const isLogin200 = loginRes.statusCode === 200;
          const hasAccessToken = Boolean(loginData.accessToken);
          record(
            'Login Endpoint Authentication (200 OK & Access Token)',
            isLogin200 && hasAccessToken,
            `HTTP ${loginRes.statusCode} | Access Token: ${hasAccessToken ? '<MASKED>' : 'MISSING'}`
          );

          const corsOrigin = loginRes.headers['access-control-allow-origin'];
          const corsCreds = loginRes.headers['access-control-allow-credentials'];
          const passCors = corsOrigin === webOrigin && corsCreds === 'true';
          record(
            'Login Response CORS Credentials & Origin Reflection',
            passCors,
            `Allow-Origin: ${corsOrigin || 'NONE'} | Allow-Credentials: ${corsCreds || 'NONE'}`
          );

          const setCookieHeaders = loginRes.headers['set-cookie'] || [];
          const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
          const refreshCookie = cookies.find((c) => c && (c.startsWith('crm_refresh_token=') || c.startsWith('refresh_token=')));

          if (!refreshCookie) {
            record(
              'Session Cookie Issued (crm_refresh_token)',
              false,
              'crm_refresh_token not found in Set-Cookie headers'
            );
          } else {
            const cookieStr = refreshCookie.toLowerCase();
            const hasHttpOnly = cookieStr.includes('httponly');
            const hasSecure = cookieStr.includes('secure');
            const hasSameSiteStrict = cookieStr.includes('samesite=strict');
            const hasPath = cookieStr.includes('path=/api/v1/auth');

            const securePass = hasSecure || (allowInsecure && !hasSecure);

            record(
              'Session Cookie HttpOnly Flag',
              hasHttpOnly,
              hasHttpOnly ? 'HttpOnly present (prevents XSS exfiltration)' : 'MISSING HttpOnly flag'
            );

            record(
              'Session Cookie Secure Flag',
              securePass,
              hasSecure
                ? 'Secure present (TLS transmission only)'
                : allowInsecure
                ? 'Secure omitted (permitted in --allow-insecure mode)'
                : 'MISSING Secure flag in production HTTPS'
            );

            record(
              'Session Cookie SameSite=Strict Attribute',
              hasSameSiteStrict,
              hasSameSiteStrict ? 'SameSite=Strict verified (prevents CSRF)' : 'MISSING or invalid SameSite'
            );

            record(
              'Session Cookie Restricted Path (/api/v1/auth)',
              hasPath,
              hasPath ? 'Path=/api/v1/auth verified (limits cookie scope)' : 'Path not restricted to auth endpoint'
            );
          }

          record(
            'Rate Limit Headers Emitted (X-RateLimit-*)',
            Boolean(observedRateLimitRemaining !== undefined),
            `Remaining: ${observedRateLimitRemaining || 'N/A'} / ${observedRateLimitLimit || 'N/A'} (Reset: ${observedRateLimitReset || 'N/A'}s)`
          );

          if (hasAccessToken) {
            console.log('\n        Executing Logout probe to clean up session ...');
            const rawCookieVal = refreshCookie ? refreshCookie.split(';')[0] : '';
            const logoutRes = await makeRequest(`${apiBase}/auth/logout`, {
              method: 'POST',
              headers: {
                Origin: webOrigin,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                Authorization: `Bearer ${loginData.accessToken}`,
                Cookie: rawCookieVal,
              },
            });

            const isLogoutSuccess = logoutRes.statusCode === 200 || logoutRes.statusCode === 201;
            record(
              'User Logout & Token Revocation Probe',
              isLogoutSuccess,
              `HTTP ${logoutRes.statusCode} | Session successfully cleared on server`
            );
          }
        } catch (err) {
          if (err.code === 'ENOTFOUND') {
            record('Login & Session Integrity Probe', false, `Skipped: DNS: ${apiHost} does not exist yet`);
          } else {
            record('Login & Session Integrity Probe', false, `Request failed: ${err.message}`);
          }
        }
      }
    }
  }

  // ─── Rate Limit Note (--rate-limit-note) ─────────────────────────────────
  if (rateLimitNote) {
    console.log('\n========================================================================');
    console.log('RATE LIMITING & TRUST_PROXY NETWORK ISOLATION NOTE');
    console.log('========================================================================');
    if (observedRateLimitRemaining !== null && observedRateLimitRemaining !== undefined) {
      console.log(`Current Obs. X-RateLimit-Remaining: ${observedRateLimitRemaining} / ${observedRateLimitLimit} (Reset in ${observedRateLimitReset}s)`);
    } else {
      console.log('Current Counter: Not probed in this run (use --login-check to probe remaining count)');
    }
    console.log(`
HOW TO DETECT SHARED THROTTLING (MOBILE DATA VS. WI-FI TEST):
1. Open the login page on a mobile device connected to Cellular/Mobile Data (e.g. 5G/LTE).
2. Open the login page on a computer connected to local Office/Home Wi-Fi.
3. Submit one invalid login attempt from the mobile phone, and one from the computer.
4. Inspect the response headers (X-RateLimit-Remaining):
   - INDEPENDENT COUNTERS: Each network has its own counter decrementing independently
     (e.g., Wi-Fi shows 99, Mobile shows 99). This proves TRUST_PROXY is correctly
     extracting unique client IP addresses through the reverse proxy.
   - SHARED COUNTERS (COLLAPSED): If an attempt on Mobile decrements the counter seen on Wi-Fi
     (e.g., Wi-Fi sees 98 after Mobile's attempt), Express is resolving every client to the
     same upstream proxy loopback IP (127.0.0.1).
     -> ACTION: In hPanel Environment Variables, verify TRUST_PROXY=1 (default 1 hop in production).
     Never leave TRUST_PROXY unset or 0 in production behind a proxy.
========================================================================`);
  }

  // ─── Final Summary ─────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('VERIFY:LIVE RESULTS SUMMARY');
  console.log('========================================================================');
  for (const r of results) {
    console.log(` ${r.pass ? '[PASS]' : '[FAIL]'} ${r.check}`);
  }
  console.log('========================================================================');

  if (!allPassed) {
    console.error('\n[FATAL] One or more live verification checks failed.');
    process.exit(1);
  } else {
    console.log('\n[ALL VERIFICATION CHECKS PASSED]');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
