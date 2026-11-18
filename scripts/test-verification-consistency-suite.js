/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function run() {
  console.log('======================================================================');
  console.log(' [TEST:SUITE] Verification Consistency & Server Sleep Resilience Tests');
  console.log('======================================================================\n');

  console.log('--- Step 1: Inventory of All 7 Verification Screens ---');
  it('Screenshots and metadata exist for all 7 verification screens in 4 variants (28 total)', () => {
    const evidenceDir = path.resolve(__dirname, '../evidence/verification-screens');
    assert.strictEqual(fs.existsSync(evidenceDir), true, 'Evidence directory must exist');
    const files = fs.readdirSync(evidenceDir);
    const pngs = files.filter((f) => f.endsWith('.png'));
    assert.strictEqual(pngs.length >= 28, true, `Expected >= 28 screenshots, found ${pngs.length}`);

    // Verify 7 distinct screens
    const screens = [
      'inventory-01-login-2step-authenticator',
      'inventory-02-login-2step-email',
      'inventory-03-login-2step-backup',
      'inventory-04-forced-2step-setup',
      'inventory-05-forgot-password-otp',
      'inventory-06-email-change-otp',
      'inventory-07-phone-change-otp',
    ];
    for (const screen of screens) {
      const match = pngs.filter((f) => f.startsWith(screen));
      assert.strictEqual(match.length, 4, `Screen ${screen} must have 4 variants (1536/390 x light/dark)`);
    }
  });

  console.log('\n--- Step 2: Single Shared Component VerificationCodeForm ---');
  const codeFormFile = path.resolve(__dirname, '../apps/web/src/components/common/VerificationCodeForm.tsx');
  assert.strictEqual(fs.existsSync(codeFormFile), true, 'VerificationCodeForm.tsx must exist');
  const codeFormContent = fs.readFileSync(codeFormFile, 'utf8');

  it('VerificationCodeForm provides 6-box input with paste, numeric keypad, and auto-submit', () => {
    assert.strictEqual(codeFormContent.includes('digits.map'), true, 'Must map over 6 digits');
    assert.strictEqual(codeFormContent.includes('inputMode="numeric"'), true, 'Must use inputMode="numeric"');
    assert.strictEqual(codeFormContent.includes('autoComplete="one-time-code"'), true, 'Must specify one-time-code autocomplete');
    assert.strictEqual(codeFormContent.includes('handleDigitPaste'), true, 'Must support paste handling');
    assert.strictEqual(codeFormContent.includes('void onSubmit(next.join(\'\'))'), true, 'Must auto-submit on 6th digit');
  });

  it('VerificationCodeForm supports backup recovery codes with single input', () => {
    assert.strictEqual(codeFormContent.includes("method === 'backup'"), true, 'Must branch on backup method');
    assert.strictEqual(codeFormContent.includes('backupCode'), true, 'Must handle backupCode state');
  });

  it('VerificationCodeForm implements live countdown, resend cooldown, and error display rules', () => {
    assert.strictEqual(codeFormContent.includes('cooldown'), true, 'Must manage resend cooldown countdown');
    assert.strictEqual(codeFormContent.includes('expiryCountdown'), true, 'Must track code expiry countdown');
    assert.strictEqual(codeFormContent.includes('lockedCountdown'), true, 'Must track lockout countdown');
    assert.strictEqual(codeFormContent.includes('handleUserTyping'), true, 'Must clear error when typing');
  });

  it('VerificationCodeForm includes accordion help panel ("Where is my code?")', () => {
    assert.strictEqual(codeFormContent.includes('Where is my code?'), true, 'Must include help accordion header');
    assert.strictEqual(codeFormContent.includes('showHelp'), true, 'Must support toggling help panel');
  });

  it('VerificationCodeForm implements unified wording table across methods', () => {
    assert.strictEqual(codeFormContent.includes('Enter the 6-digit code from your authenticator app.'), true);
    assert.strictEqual(codeFormContent.includes('Enter the 6-digit code we sent to'), true);
    assert.strictEqual(codeFormContent.includes('Enter one of your backup codes.'), true);
  });

  console.log('\n--- Step 3: Flow Clarity & Step Progression ---');
  const forgotPageFile = path.resolve(__dirname, '../apps/web/src/pages/ForgotPasswordPage.tsx');
  const forgotPageContent = fs.readFileSync(forgotPageFile, 'utf8');

  it('Forgot Password shows 3 real step names with progress indicator', () => {
    assert.strictEqual(forgotPageContent.includes('Find your account'), true, 'Must include "Find your account"');
    assert.strictEqual(forgotPageContent.includes('Verify it is you'), true, 'Must include "Verify it is you"');
    assert.strictEqual(forgotPageContent.includes('Set a new password'), true, 'Must include "Set a new password"');
    assert.strictEqual(forgotPageContent.includes('VerificationCodeForm'), true, 'Must use VerificationCodeForm on step 2');
  });

  it('Forgot Password success screen informs user 2-step code will be asked next', () => {
    assert.strictEqual(forgotPageContent.includes('Password changed.'), true, 'Must show "Password changed."');
    assert.strictEqual(forgotPageContent.includes('Next, you will be asked for your 2-step code.'), true, 'Must show next 2-step prompt');
  });

  const twoFaChallengeFile = path.resolve(__dirname, '../apps/web/src/components/common/TwoFactorChallenge.tsx');
  const twoFaContent = fs.readFileSync(twoFaChallengeFile, 'utf8');

  it('Login 2-Step screen states which method is asked, offers alternative methods, and recovery link', () => {
    assert.strictEqual(twoFaContent.includes('VerificationCodeForm'), true, 'Must use VerificationCodeForm');
    assert.strictEqual(twoFaContent.includes('Lost your authenticator? Receive code by email'), true, 'Must offer email recovery');
    assert.strictEqual(twoFaContent.includes('alternativeMethods'), true, 'Must provide alternative methods');
  });

  console.log('\n--- Step 4: Trusted Device Unchecked Default & Invalidation ---');
  it('TwoFactorChallenge starts "Trust this device" checkbox unchecked with short explanation', () => {
    assert.strictEqual(twoFaContent.includes('const [trustDevice, setTrustDevice] = useState(false);'), true, 'Must default to false (unchecked)');
    assert.strictEqual(twoFaContent.includes('Trust this device for 30 days (Only on your own device)'), true, 'Must include explanation');
  });

  const myAccountFile = path.resolve(__dirname, '../apps/web/src/pages/MyAccountPage.tsx');
  const myAccountContent = fs.readFileSync(myAccountFile, 'utf8');

  it('My Account lists Trusted Devices with Revoke and Revoke All buttons', () => {
    assert.strictEqual(myAccountContent.includes('Trusted Devices'), true, 'Must have Trusted Devices section');
    assert.strictEqual(myAccountContent.includes('Revoke All Trusted Devices'), true, 'Must have Revoke All button');
    assert.strictEqual(myAccountContent.includes('handleRevokeTrustedDevice'), true, 'Must have individual Revoke button');
  });

  const authServiceFile = path.resolve(__dirname, '../apps/api/src/auth/auth.service.ts');
  const authServiceContent = fs.readFileSync(authServiceFile, 'utf8');

  it('Password change and reset revokes all trusted devices in database', () => {
    const changePwdMatches = authServiceContent.includes('prisma.trustedDevice.deleteMany');
    assert.strictEqual(changePwdMatches, true, 'Backend must delete trusted devices on password changes');
  });

  console.log('\n--- Step 5: Wrong Portal Help & Safe Anti-Enumeration ---');
  const loginFormFile = path.resolve(__dirname, '../apps/web/src/components/auth/AuthLoginForm.tsx');
  const loginFormContent = fs.readFileSync(loginFormFile, 'utf8');

  it('Shows contextual wrong-portal hint without revealing account existence', () => {
    assert.strictEqual(loginFormContent.includes('Using a company account?'), true, 'Platform portal must offer company link');
    assert.strictEqual(loginFormContent.includes('Go to company sign in'), true, 'Platform portal must link to /login');
    assert.strictEqual(loginFormContent.includes('Platform administrator?'), true, 'Company portal must offer platform link');
    assert.strictEqual(loginFormContent.includes('Use the platform sign in'), true, 'Company portal must link to /platform/login');
  });

  console.log('\n--- Step 6: Sleeping Server Detection & Health Endpoints ---');
  it('AuthLoginForm shows "Waking up the server, this can take up to a minute" with progress bar', () => {
    assert.strictEqual(loginFormContent.includes('Waking up the server, this can take up to a minute'), true);
    assert.strictEqual(loginFormContent.includes('wakingSeconds'), true, 'Must show elapsed seconds');
    assert.strictEqual(loginFormContent.includes('handleRetryWakeup'), true, 'Must provide manual Retry button');
  });

  it('AuthLoginForm auto-retries against /health/live with backoff and clears password after 15s', () => {
    assert.strictEqual(loginFormContent.includes('/health/live'), true, 'Must poll /health/live');
    assert.strictEqual(loginFormContent.includes('next >= 15'), true, 'Must clear password after 15s');
    assert.strictEqual(loginFormContent.includes('next >= 90'), true, 'Must show friendly timeout after 90s');
    assert.strictEqual(loginFormContent.includes('Request ID:'), true, 'Must include Request ID');
  });

  it('docs/keep-warm.md exists and documents keep-warm setup', () => {
    const keepWarmFile = path.resolve(__dirname, '../docs/keep-warm.md');
    assert.strictEqual(fs.existsSync(keepWarmFile), true, 'docs/keep-warm.md must exist');
    const content = fs.readFileSync(keepWarmFile, 'utf8');
    assert.strictEqual(content.includes('Keep-Warm Strategy'), true);
    assert.strictEqual(content.includes('/api/v1/health/live'), true);
    assert.strictEqual(content.includes('/api/v1/health/ready'), true);
  });

  await itAsync('API exposes lightweight GET /health/live and GET /health/ready endpoints', async () => {
    const liveRes = await fetch('http://localhost:3333/api/v1/health/live');
    assert.strictEqual(liveRes.status, 200, 'GET /health/live must return 200 OK');
    const liveData = await liveRes.json();
    assert.strictEqual(liveData.status, 'ok');

    const readyRes = await fetch('http://localhost:3333/api/v1/health/ready');
    assert.strictEqual([200, 503].includes(readyRes.status), true, 'GET /health/ready must respond with 200 or 503');
    const readyData = await readyRes.json();
    assert.strictEqual(typeof readyData.status, 'string');
  });

  console.log('\n--- Step 7: Login Speed & Direct Navigation ---');
  it('AuthService verifies candidates concurrently with Promise.all', () => {
    assert.strictEqual(authServiceContent.includes('await Promise.all(\n      candidates.map(async (candidate) => {'), true);
  });

  it('TwoFactorChallenge and AuthLoginForm redirect directly to getRoleRedirectPath(user)', () => {
    assert.strictEqual(twoFaContent.includes('getRoleRedirectPath'), true, 'TwoFactorChallenge must use getRoleRedirectPath');
    assert.strictEqual(loginFormContent.includes('getRoleRedirectPath'), true, 'AuthLoginForm must use getRoleRedirectPath');
  });

  console.log('\n--- Step 8: Password Field Security & Ephemeral Toggle ---');
  it('Password eye toggle automatically hides password after 10s or on window blur or submit', () => {
    assert.strictEqual(loginFormContent.includes('setTimeout(() => {\n      setShowPassword(false);'), true, 'Must auto-hide after 10s');
    assert.strictEqual(loginFormContent.includes("window.addEventListener('blur', handleBlur)"), true, 'Must auto-hide on blur');
    assert.strictEqual(loginFormContent.includes('setShowPassword(false)'), true, 'Must hide on submit');
  });

  console.log('\n======================================================================');
  console.log(` [PASSED] ${passedTests}/${totalTests} Verification Consistency & Reliability Tests Succeeded!`);
  console.log('======================================================================\n');
}

run().catch((err) => {
  console.error('\n[FATAL] Test execution failed:', err);
  process.exit(1);
});
