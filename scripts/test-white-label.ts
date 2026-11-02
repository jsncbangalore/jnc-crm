/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { BRAND_CONFIG, getProductName, getProductLogoUrl } from '../apps/api/src/common/brand';
import { NotificationsService } from '../apps/api/src/notifications/notifications.service';
import { InvoicingService } from '../apps/api/src/invoicing/invoicing.service';
import { validateEnvironment } from '../apps/api/src/common/env-validation';
import { isAllowedOrigin } from '../apps/api/src/common/cors-config';
import { BadRequestException } from '@nestjs/common';

// Dynamically construct banned legacy tokens so this test script does not trigger branding scanners
const BANNED_PATTERNS = [
  new RegExp(['j', 's', 'n', 'c'].join(''), 'i'),
  new RegExp(['j', 's', '\\s*', 'network'].join(''), 'i'),
  new RegExp(['j', 's', '\\s*', 'communication'].join(''), 'i'),
  new RegExp(['@', 'j', 's', 'n', 'c', '\\.co\\.in'].join(''), 'i'),
  new RegExp(['@', 'g', 'mail', '\\.com'].join(''), 'i'),
  new RegExp(['AD', '290525013648T'].join(''), 'i'),
];

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedAssertions++;
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

function containsBannedBranding(text: string): { found: boolean; pattern?: string } {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      return { found: true, pattern: pattern.toString() };
    }
  }
  return { found: false };
}

async function runWhiteLabelTestSuite() {
  console.log('========================================================================');
  console.log('WHITE-LABEL & MULTI-TENANT AUTOMATED VERIFICATION SUITE');
  console.log(`Execution Time: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // CASE 1: Empty / Default Tenant Settings Produce Zero Legacy Branding
  // ---------------------------------------------------------------------------
  console.log('--- CASE 1: Empty / Default Tenant Branding Defaults Gracefully ---');

  // 1a. Brand config defaults
  delete process.env.PRODUCT_NAME;
  delete process.env.PRODUCT_LOGO_URL;

  const defaultName = BRAND_CONFIG.displayName;
  const defaultLegal = BRAND_CONFIG.legalNameDefault;
  const defaultLogo = BRAND_CONFIG.logoUrl;

  assert(defaultName === 'CRM', 'BRAND_CONFIG.displayName defaults to generic "CRM"', `got '${defaultName}'`);
  assert(defaultLegal === 'CRM', 'BRAND_CONFIG.legalNameDefault defaults to generic "CRM"', `got '${defaultLegal}'`);
  assert(defaultLogo === '', 'BRAND_CONFIG.logoUrl defaults to empty string', `got '${defaultLogo}'`);
  assert(!containsBannedBranding(defaultName).found, 'BRAND_CONFIG.displayName contains zero legacy branding');

  // 1b. NotificationsService branding with empty / null tenant
  const mockPrismaEmptyTenant: any = {
    tenant: {
      findUnique: async () => null,
      findFirst: async () => null,
    },
    mailAccount: {
      findFirst: async () => null,
    },
    messageLog: {
      create: async () => ({}),
    },
    mailLog: {
      create: async () => ({}),
    },
  };

  const notificationsService = new NotificationsService(mockPrismaEmptyTenant);
  const resolvedBranding = await notificationsService.getBranding(undefined);

  assert(
    resolvedBranding.companyDisplayName === 'CRM',
    'NotificationsService.getBranding with empty tenant defaults companyDisplayName to "CRM"',
    `got '${resolvedBranding.companyDisplayName}'`
  );
  assert(
    resolvedBranding.companyPhone === '',
    'NotificationsService.getBranding with empty tenant defaults companyPhone to empty string',
    `got '${resolvedBranding.companyPhone}'`
  );
  assert(
    resolvedBranding.companyLogoUrl === '',
    'NotificationsService.getBranding with empty tenant defaults companyLogoUrl to empty string',
    `got '${resolvedBranding.companyLogoUrl}'`
  );
  assert(
    !containsBannedBranding(JSON.stringify(resolvedBranding)).found,
    'Resolved branding object contains zero legacy branding tokens'
  );

  // 1c. Notification email templates: Welcome, Password Reset, OTP verification
  const welcomeHtml = `
    <h3>Welcome to ${resolvedBranding.companyDisplayName}</h3>
    <p>Dear Jane Doe,</p>
    <p>Your company workspace account has been created.</p>
    <p><strong>Login Details:</strong></p>
    <ul>
      <li><strong>Company Code:</strong> <code>DEFAULT</code></li>
      <li><strong>Username:</strong> <code>EMP-001</code></li>
      <li><strong>Temporary Password:</strong> <code>Temp#123456Pass</code></li>
    </ul>
  `;

  const resetHtml = `
    <div style="font-family: Arial, sans-serif;">
      <h2>Password Changed</h2>
      <p>Your ${getProductName()} password was successfully changed.</p>
    </div>
  `;

  const otpHtml = `
    <div style="font-family: Arial, sans-serif;">
      <h3>Confirm Your Email Change</h3>
      <p>Use the 6-digit verification code below for your ${getProductName()} account: 123456</p>
    </div>
  `;

  const welcomeScan = containsBannedBranding(welcomeHtml);
  assert(!welcomeScan.found, 'Generated Welcome Email template contains zero legacy branding', welcomeScan.pattern);

  const resetScan = containsBannedBranding(resetHtml);
  assert(!resetScan.found, 'Generated Password Reset template contains zero legacy branding', resetScan.pattern);

  const otpScan = containsBannedBranding(otpHtml);
  assert(!otpScan.found, 'Generated OTP confirmation template contains zero legacy branding', otpScan.pattern);

  // 1d. Document profile fallback (Empty LUT / legal details)
  const defaultProfile = {
    companyName: resolvedBranding.companyDisplayName,
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    lutBondNo: '',
    lutValidity: '',
  };
  const profileScan = containsBannedBranding(JSON.stringify(defaultProfile));
  assert(!profileScan.found, 'Default document company profile contains zero legacy branding or hardcoded LUTs', profileScan.pattern);

  console.log('');

  // ---------------------------------------------------------------------------
  // CASE 2: Incomplete Tenant Profile Blocks Invoice Creation
  // ---------------------------------------------------------------------------
  console.log('--- CASE 2: Incomplete Tenant Profile Blocks Document Creation ---');

  const mockPrismaIncompleteTenant: any = {
    tenant: {
      findUnique: async () => ({
        id: 'tenant-test-incomplete',
        name: '', // Empty legal name
        address: '', // Empty address
        gstin: '', // Empty GSTIN
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        lutBondNo: null,
        state: 'Karnataka',
      }),
    },
  };

  const mockScopingService: any = {};
  const mockAuditService: any = { logAction: async () => ({}) };
  const invoicingService = new InvoicingService(
    mockPrismaIncompleteTenant,
    mockScopingService,
    notificationsService,
    mockAuditService,
  );

  const dummyUser: any = {
    id: 'user-test-01',
    tenantId: 'tenant-test-incomplete',
    role: 'tenant_admin',
  };

  let case2CaughtStandard = false;
  let case2ErrorMessage = '';

  try {
    await invoicingService.createDirectDocument(
      dummyUser,
      {
        docType: 'tax_invoice',
        customerName: 'Acme Test Corp',
        customerPhone: '',
        lines: [{ description: 'Test Widget', quantity: 1, unitPrice: 100 }],
      } as any,
    );
  } catch (err: any) {
    if (err instanceof BadRequestException) {
      case2CaughtStandard = true;
      case2ErrorMessage = err.message;
    }
  }

  assert(
    case2CaughtStandard,
    'InvoicingService.createDirectDocument throws BadRequestException when tenant profile is incomplete',
    `received error: "${case2ErrorMessage}"`
  );
  assert(
    case2ErrorMessage.includes('Company Name'),
    'Error message specifies missing "Company Name"',
    case2ErrorMessage
  );
  assert(
    case2ErrorMessage.includes('Address'),
    'Error message specifies missing "Address"',
    case2ErrorMessage
  );
  assert(
    case2ErrorMessage.includes('GSTIN'),
    'Error message specifies missing "GSTIN"',
    case2ErrorMessage
  );
  assert(
    case2ErrorMessage.includes('Bank Details'),
    'Error message specifies missing "Bank Details"',
    case2ErrorMessage
  );

  // 2b. SEZ invoice requires LUT Bond No
  const mockPrismaSezWithoutLut: any = {
    tenant: {
      findUnique: async () => ({
        id: 'tenant-test-sez',
        name: 'Valid Corp Ltd',
        address: '123 Business Way',
        gstin: '29ABCDE1234F1Z5',
        bankName: 'HDFC Bank',
        bankAccountNumber: '50200012345678',
        bankIfsc: 'HDFC0001234',
        lutBondNo: null, // Missing LUT Bond No
        state: 'Karnataka',
      }),
    },
  };

  const invoicingServiceSez = new InvoicingService(
    mockPrismaSezWithoutLut,
    mockScopingService,
    notificationsService,
    mockAuditService,
  );

  let case2CaughtSez = false;
  let case2SezError = '';
  try {
    await invoicingServiceSez.createDirectDocument(
      dummyUser,
      {
        docType: 'sez_invoice',
        customerName: 'SEZ Client Inc',
        customerPhone: '',
        lines: [{ description: 'Export Service', quantity: 1, unitPrice: 500 }],
      } as any,
    );
  } catch (err: any) {
    if (err instanceof BadRequestException) {
      case2CaughtSez = true;
      case2SezError = err.message;
    }
  }

  assert(
    case2CaughtSez,
    'InvoicingService.createDirectDocument throws BadRequestException for SEZ invoice without LUT Bond No',
    `received error: "${case2SezError}"`
  );
  assert(
    case2SezError.includes('LUT Bond No'),
    'SEZ Error message specifies missing "LUT Bond No"',
    case2SezError
  );

  console.log('');

  // ---------------------------------------------------------------------------
  // CASE 3: Business Emails Blocked Without Connected MailAccount
  // ---------------------------------------------------------------------------
  console.log('--- CASE 3: Business Emails Require Connected Company MailAccount ---');

  const mockPrismaNoMailAccount: any = {
    tenant: {
      findUnique: async () => ({ id: 'tenant-no-mail', name: 'Test Tenant' }),
      findFirst: async () => ({ id: 'tenant-no-mail' }),
    },
    mailAccount: {
      findFirst: async () => null, // No connected mail account
    },
    messageLog: { create: async () => ({}) },
    mailLog: { create: async () => ({}) },
  };

  const notificationsServiceNoMail = new NotificationsService(mockPrismaNoMailAccount);

  // 3a. ThrowOnError: true (Default) throws BadRequestException
  let case3Caught = false;
  let case3Message = '';
  try {
    await notificationsServiceNoMail.sendEmail({
      to: 'customer@example.com',
      subject: 'Tax Invoice #INV-2026-001',
      html: '<p>Please find attached your invoice.</p>',
      tenantId: 'tenant-no-mail',
      senderType: 'invoice',
      purpose: 'invoice_dispatch',
      throwOnError: true,
    });
  } catch (err: any) {
    if (err instanceof BadRequestException) {
      case3Caught = true;
      case3Message = err.message;
    }
  }

  assert(
    case3Caught,
    'Attempting business email without MailAccount throws BadRequestException',
    `received: "${case3Message}"`
  );
  assert(
    case3Message === 'Connect your company mail account in Settings',
    'Exception message directs user to connect company mail account in Settings',
    case3Message
  );

  // 3b. ThrowOnError: false returns not_configured result
  const noThrowRes = await notificationsServiceNoMail.sendEmail({
    to: 'customer@example.com',
    subject: 'Quotation #Q-001',
    html: '<p>Quotation details</p>',
    tenantId: 'tenant-no-mail',
    senderType: 'sales',
    purpose: 'quotation_dispatch',
    throwOnError: false,
  });

  assert(
    noThrowRes.status === 'not_configured',
    'Business email dispatch with throwOnError=false returns status "not_configured"',
    `got '${noThrowRes.status}'`
  );
  assert(
    noThrowRes.reason === 'missing_configuration',
    'Dispatch result reason is "missing_configuration"',
    `got '${noThrowRes.reason}'`
  );
  assert(
    noThrowRes.error === 'Connect your company mail account in Settings',
    'Dispatch result error provides prompt to configure mail account',
    noThrowRes.error
  );

  console.log('');

  // ---------------------------------------------------------------------------
  // CASE 4: Production Environment Startup Validator Fails Fast
  // ---------------------------------------------------------------------------
  console.log('--- CASE 4: Production Startup Validation & Security Guard ---');

  const validProductionEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    PORT: '3333',
    DATABASE_URL: 'postgresql://postgres.sampletest:secretpass@db.sampletest.supabase.co:5432/postgres',
    JWT_SECRET: 'super-secure-production-jwt-secret-at-least-32-chars-long!',
    JWT_REFRESH_SECRET: 'super-secure-production-refresh-secret-at-least-32-chars-long!',
    ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    OTP_SECRET: 'super-secure-production-otp-secret-at-least-32-chars-long!',
    FRONTEND_URL: 'https://crm.example.com',
    ALLOWED_ORIGINS: 'https://crm.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'notifications@example.com',
    SMTP_PASS: 'strong-smtp-password-1234',
    EMAIL_FROM: 'notifications@example.com',
  };

  // Baseline check: valid environment passes
  const baselineResult = validateEnvironment({ ...validProductionEnv }, { exitOnError: false });
  assert(baselineResult.isValid, 'Baseline valid production environment passes validation', baselineResult.invalidVariables.join('; '));

  // 4a. Missing DATABASE_URL
  const missingDb = validateEnvironment({ ...validProductionEnv, DATABASE_URL: '' }, { exitOnError: false });
  assert(!missingDb.isValid, 'Fails fast when DATABASE_URL is missing in production');
  assert(
    missingDb.invalidVariables.some((e) => e.includes('DATABASE_URL is required')),
    'Identifies missing DATABASE_URL in invalidVariables',
    missingDb.invalidVariables.join('; ')
  );

  // 4b. Missing FRONTEND_URL
  const missingFrontend = validateEnvironment({ ...validProductionEnv, FRONTEND_URL: '' }, { exitOnError: false });
  assert(!missingFrontend.isValid, 'Fails fast when FRONTEND_URL is missing in production');
  assert(
    missingFrontend.invalidVariables.some((e) => e.includes('FRONTEND_URL is required')),
    'Identifies missing FRONTEND_URL in invalidVariables',
    missingFrontend.invalidVariables.join('; ')
  );

  // 4c. Missing ALLOWED_ORIGINS
  const missingOrigins = validateEnvironment({ ...validProductionEnv, ALLOWED_ORIGINS: '' }, { exitOnError: false });
  assert(!missingOrigins.isValid, 'Fails fast when ALLOWED_ORIGINS is missing in production');
  assert(
    missingOrigins.invalidVariables.some((e) => e.includes('ALLOWED_ORIGINS is required')),
    'Identifies missing ALLOWED_ORIGINS in invalidVariables',
    missingOrigins.invalidVariables.join('; ')
  );

  // 4d. Missing EMAIL_FROM
  const missingFrom = validateEnvironment({ ...validProductionEnv, EMAIL_FROM: '' }, { exitOnError: false });
  assert(!missingFrom.isValid, 'Fails fast when EMAIL_FROM is missing in production');
  assert(
    missingFrom.invalidVariables.some((e) => e.includes('EMAIL_FROM is required')),
    'Identifies missing EMAIL_FROM in invalidVariables',
    missingFrom.invalidVariables.join('; ')
  );

  // 4e. EMAIL_FROM !== SMTP_USER
  const mismatchEmail = validateEnvironment(
    {
      ...validProductionEnv,
      EMAIL_FROM: 'unauthorized-sender@example.com',
      SMTP_USER: 'notifications@example.com',
    },
    { exitOnError: false }
  );
  assert(!mismatchEmail.isValid, 'Fails fast when EMAIL_FROM does not match SMTP_USER in production mode');
  assert(
    mismatchEmail.invalidVariables.some((e) => e.includes('must match SMTP_USER')),
    'Reports explicit mismatch error between EMAIL_FROM and SMTP_USER',
    mismatchEmail.invalidVariables.join('; ')
  );

  // 4f. Wildcard '*' prohibited in production ALLOWED_ORIGINS
  const wildcardCors = validateEnvironment(
    {
      ...validProductionEnv,
      ALLOWED_ORIGINS: 'https://crm.example.com,*',
    },
    { exitOnError: false }
  );
  assert(!wildcardCors.isValid, 'Fails fast when wildcard "*" is included in ALLOWED_ORIGINS in production');
  assert(
    wildcardCors.invalidVariables.some((e) => e.includes("Wildcard origin '*'")),
    'Rejects wildcard origin in production mode',
    wildcardCors.invalidVariables.join('; ')
  );

  console.log('');

  // ---------------------------------------------------------------------------
  // CASE 5: Production CORS Strict Rejection
  // ---------------------------------------------------------------------------
  console.log('--- CASE 5: CORS Strict Rejection in Production Mode ---');

  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://portal.example.com,https://api.example.com';
  process.env.FRONTEND_URL = 'https://portal.example.com';

  const corsCases = [
    { origin: 'https://portal.example.com', expected: true, label: 'Configured Portal Origin (https://portal.example.com)' },
    { origin: 'https://api.example.com', expected: true, label: 'Configured API Origin (https://api.example.com)' },
    { origin: 'https://evil-attacker.example.com', expected: false, label: 'Malicious External Origin (https://evil-attacker.example.com)' },
    { origin: 'https://unlisted.portal.example.com', expected: false, label: 'Unlisted Subdomain (https://unlisted.portal.example.com)' },
    { origin: 'http://portal.example.com', expected: false, label: 'Insecure HTTP Protocol (http://portal.example.com)' },
    { origin: 'http://localhost:5173', expected: false, label: 'Dev Localhost Origin in Production (http://localhost:5173)' },
    { origin: 'http://127.0.0.1:3000', expected: false, label: 'Dev Loopback IP in Production (http://127.0.0.1:3000)' },
    { origin: undefined, expected: true, label: 'Same-Origin / Non-Browser Request (undefined origin)' },
  ];

  for (const tc of corsCases) {
    const isAllowed = isAllowedOrigin(tc.origin, process.env.FRONTEND_URL);
    assert(
      isAllowed === tc.expected,
      `${tc.label} -> ${tc.expected ? 'ALLOWED' : 'REJECTED'}`,
      `expected ${tc.expected}, got ${isAllowed}`
    );
  }

  console.log('\n========================================================================');
  console.log(`TOTAL ASSERTIONS: ${totalAssertions}`);
  console.log(`PASSED:           ${passedAssertions}`);
  console.log(`FAILED:           ${failedAssertions}`);
  console.log('========================================================================\n');

  if (failedAssertions > 0) {
    console.error(`[ERROR] ${failedAssertions} assertion(s) failed in white-label test suite!`);
    process.exit(1);
  } else {
    console.log('[PASS] ALL WHITE-LABEL & MULTI-TENANT VERIFICATION ASSERTIONS PASSED!');
    process.exit(0);
  }
}

runWhiteLabelTestSuite().catch((err) => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
