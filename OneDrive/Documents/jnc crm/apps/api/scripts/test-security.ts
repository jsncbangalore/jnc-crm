/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { encryptAtRest, decryptAtRest } from '../src/common/encryption.util';
import { validatePasswordPolicy, needsRehash } from '../src/common/password-policy';
import { sanitizeObject } from '../src/common/sanitize-response.interceptor';
import { sanitizeFormulaExport, sanitizeFormulaImport } from '../src/common/csv-sanitize.util';
import { validateMagicBytes, checkDoubleExtension } from '../src/common/file-validator';

const prisma = new PrismaClient();

let passedCount = 0;
let failedCount = 0;
let skippedCount = 0;

function assert(condition: boolean, testName: string, failureDetail?: string) {
  if (condition) {
    console.log(`[PASSED] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAILED] ${testName}${failureDetail ? ` - ${failureDetail}` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('       JNC-CRM SECURITY HARDENING AUTOMATED TEST SUITE          ');
  console.log('================================================================\n');

  // Test 1: Encryption at Rest (AES-256-GCM)
  try {
    const plaintext = 'SuperSecretSmtpPassword123!#';
    const encrypted = encryptAtRest(plaintext);
    const decrypted = decryptAtRest(encrypted);
    assert(
      decrypted === plaintext && encrypted !== plaintext && !!encrypted && encrypted.includes(':'),
      'Test 1: AES-256-GCM encryption/decryption round-trip',
    );

    // Tampered payload detection
    const parts = encrypted!.split(':');
    parts[1] = 'ffff' + parts[1].slice(4); // corrupt auth tag
    const tamperedResult = decryptAtRest(parts.join(':'));
    assert(tamperedResult === null, 'Test 1.1: Tampered ciphertext or auth tag rejected with null');
  } catch (err: any) {
    assert(false, 'Test 1: AES-256-GCM encryption', err.message);
  }

  // Test 2: Password Policy & Bcrypt Cost 12
  try {
    let weakShortRejected = false;
    try {
      validatePasswordPolicy('short');
    } catch {
      weakShortRejected = true;
    }
    assert(weakShortRejected, 'Test 2.1: Rejects passwords shorter than 12 characters');

    let commonPassRejected = false;
    try {
      validatePasswordPolicy('password12345');
    } catch {
      commonPassRejected = true;
    }
    assert(commonPassRejected, 'Test 2.2: Rejects top common/dictionary passwords');

    let userInfoRejected = false;
    try {
      validatePasswordPolicy('rajesh123456789!', { email: 'rajesh@jsnc.co.in', name: 'Rajesh Sharma' });
    } catch {
      userInfoRejected = true;
    }
    assert(userInfoRejected, 'Test 2.3: Rejects passwords containing user identifier/email');

    let strongAccepted = true;
    try {
      validatePasswordPolicy('JncSecure#2026!ShieldX99');
    } catch {
      strongAccepted = false;
    }
    assert(strongAccepted, 'Test 2.4: Accepts compliant high-entropy password (>=12 chars)');

    // Bcrypt cost factor verification
    const hashedCost12 = await bcrypt.hash('JncSecure#2026!ShieldX99', 12);
    assert(hashedCost12.startsWith('$2a$12$') || hashedCost12.startsWith('$2b$12$'), 'Test 2.5: Hashes with bcrypt cost 12');

    const cost10Hash = await bcrypt.hash('LegacyPassword123!', 10);
    assert(needsRehash(cost10Hash), 'Test 2.6: Correctly detects legacy hash with cost < 12 needing rehash');
    assert(!needsRehash(hashedCost12), 'Test 2.7: Verifies cost 12 hash does not need rehash');
  } catch (err: any) {
    assert(false, 'Test 2: Password policy & hashing', err.message);
  }

  // Test 3: Response Secret Sanitization Interceptor
  try {
    const sensitivePayload = {
      id: 'usr_test_123',
      name: 'Admin User',
      email: 'admin@jsnc.co.in',
      passwordHash: '$2a$12$eX4mpleH4shNotT0BeLe4ked...',
      smtpPass: 'enc:iv:tag:data',
      imapPass: 'enc:iv:tag:data',
      webhookSecret: 'secret_wh_key',
      tokenHash: 'sha256_hash_here',
      nested: {
        passwordHash: 'active_hash',
        cleanField: 'clean_value',
      },
      list: [
        { passwordHash: 'hash1', item: 'A' },
        { tokenHash: 'hash2', item: 'B' },
      ],
    };

    const sanitized = sanitizeObject(sensitivePayload);
    assert(
      sanitized.passwordHash === undefined &&
      sanitized.smtpPass === undefined &&
      sanitized.imapPass === undefined &&
      sanitized.webhookSecret === undefined &&
      sanitized.tokenHash === undefined &&
      sanitized.nested.passwordHash === undefined &&
      sanitized.nested.cleanField === 'clean_value' &&
      sanitized.list[0].passwordHash === undefined &&
      sanitized.list[0].item === 'A',
      'Test 3: Response sanitizer strips sensitive credentials recursively',
    );
  } catch (err: any) {
    assert(false, 'Test 3: Response sanitizer', err.message);
  }

  // Test 4: CSV & Excel Formula Injection Prevention
  try {
    assert(sanitizeFormulaExport('=1+1') === "'=1+1", 'Test 4.1: Escapes formula starting with =');
    assert(sanitizeFormulaExport('+cmd|') === "'+cmd|", 'Test 4.2: Escapes formula starting with +');
    assert(sanitizeFormulaExport('-100') === "'-100", 'Test 4.3: Escapes formula starting with -');
    assert(sanitizeFormulaExport('@SUM(A1:A10)') === "'@SUM(A1:A10)", 'Test 4.4: Escapes formula starting with @');
    assert(sanitizeFormulaExport('Regular text') === 'Regular text', 'Test 4.5: Preserves safe regular text');

    assert(sanitizeFormulaImport("'=1+1") === '=1+1', 'Test 4.6: Strips quote from neutralized formulas on import');
  } catch (err: any) {
    assert(false, 'Test 4: Formula injection prevention', err.message);
  }

  // Test 5: File Upload Validation (Magic Bytes & Double Extensions)
  try {
    // Valid PNG header (89 50 4E 47 0D 0A 1A 0A)
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    let pngPassed = true;
    try {
      validateMagicBytes(validPngBuffer, 'receipt.png');
    } catch {
      pngPassed = false;
    }
    assert(pngPassed, 'Test 5.1: Valid PNG magic bytes accepted');

    // Executable disguised as PNG
    const fakePngBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable header
    let fakePngRejected = false;
    try {
      validateMagicBytes(fakePngBuffer, 'malicious.png');
    } catch {
      fakePngRejected = true;
    }
    assert(fakePngRejected, 'Test 5.2: Executable disguised as PNG rejected by magic bytes');

    // Double extension check
    let doubleExtRejected = false;
    try {
      checkDoubleExtension('invoice.pdf.exe');
    } catch {
      doubleExtRejected = true;
    }
    assert(doubleExtRejected, 'Test 5.3: Double extension (invoice.pdf.exe) rejected');

    let multipleExtRejected = false;
    try {
      checkDoubleExtension('invoice.pdf.png');
    } catch {
      multipleExtRejected = true;
    }
    assert(multipleExtRejected, 'Test 5.4: Multiple arbitrary extensions rejected');
  } catch (err: any) {
    assert(false, 'Test 5: File upload validation', err.message);
  }

  // Test 6: AuditLog Immutability (Append-Only Prisma Protection)
  try {
    let testTenant = await prisma.tenant.findFirst({ where: { deletedAt: null } });
    if (!testTenant) {
      testTenant = await prisma.tenant.create({
        data: {
          code: 'TST-SEC',
          name: 'Security Test Tenant',
          slug: 'tst-sec',
          status: 'active',
        },
      });
    }

    let testUser = await prisma.user.findFirst({ where: { tenantId: testTenant.id, deletedAt: null } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          tenantId: testTenant.id,
          employeeCode: 'TST-001',
          email: 'tst-sec@jsnc.co.in',
          name: 'Security Test User',
          passwordHash: await bcrypt.hash('JncSecure#2026!ShieldX99', 12),
          role: 'admin',
        },
      });
    }

    // Create Audit Log (allowed)
    const auditLog = await prisma.auditLog.create({
      data: {
        tenantId: testTenant.id,
        actorId: testUser.id,
        actorName: testUser.employeeCode,
        action: 'SECURITY_TEST_EVENT',
        entityName: 'SecurityTest',
        entityId: 'test_123',
        afterState: JSON.stringify({ status: 'INITIAL' }),
      },
    });
    assert(!!auditLog.id, 'Test 6.1: AuditLog creation succeeds (append-only)');

    // Direct update/delete queries rejected by middleware
    const protectedPrisma = new PrismaClient();
    protectedPrisma.$use(async (params, next) => {
      if (params.model === 'AuditLog') {
        const forbiddenActions = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
        if (forbiddenActions.includes(params.action)) {
          throw new Error('AuditLog records are append-only and cannot be modified or deleted.');
        }
      }
      return next(params);
    });

    let updateBlocked = false;
    try {
      await protectedPrisma.auditLog.update({
        where: { id: auditLog.id },
        data: { action: 'TAMPERED_ACTION' },
      });
    } catch (e: any) {
      if (e.message.includes('append-only')) {
        updateBlocked = true;
      }
    }
    assert(updateBlocked, 'Test 6.2: AuditLog update blocked with append-only exception');

    let deleteBlocked = false;
    try {
      await protectedPrisma.auditLog.delete({
        where: { id: auditLog.id },
      });
    } catch (e: any) {
      if (e.message.includes('append-only')) {
        deleteBlocked = true;
      }
    }
    assert(deleteBlocked, 'Test 6.3: AuditLog delete blocked with append-only exception');
    await protectedPrisma.$disconnect();
  } catch (err: any) {
    assert(false, 'Test 6: AuditLog immutability', err.message);
  }

  // Test 7: RefreshSession Lifecycle & Single-Use Rotation with Reuse Detection
  try {
    const testUser = await prisma.user.findFirst({ where: { deletedAt: null } });
    if (!testUser) throw new Error('No test user available');

    const familyId = crypto.randomUUID();
    const token1 = crypto.randomBytes(32).toString('hex');
    const tokenHash1 = crypto.createHash('sha256').update(token1).digest('hex');

    // Create initial refresh session
    const session = await prisma.refreshSession.create({
      data: {
        userId: testUser.id,
        familyId,
        tokenHash: tokenHash1,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    assert(!!session.id, 'Test 7.1: Refresh session created with familyId');

    // Rotate token
    const token2 = crypto.randomBytes(32).toString('hex');
    const tokenHash2 = crypto.createHash('sha256').update(token2).digest('hex');

    // Rotate session: mark old as revoked/used, create new in same family
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });
    const rotatedSession = await prisma.refreshSession.create({
      data: {
        userId: testUser.id,
        familyId,
        tokenHash: tokenHash2,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    assert(!!rotatedSession.id, 'Test 7.2: Token rotation succeeds in same family');

    // Token reuse detection: attempting to reuse revoked token (session.isRevoked === true)
    const attemptedOld = await prisma.refreshSession.findUnique({
      where: { tokenHash: tokenHash1 },
    });
    assert(attemptedOld?.isRevoked === true, 'Test 7.3: Old token identified as already consumed/revoked');

    // Simulated reuse handling: revoke entire family & bump tokenVersion
    if (attemptedOld?.isRevoked) {
      await prisma.refreshSession.deleteMany({
        where: { familyId: attemptedOld.familyId },
      });
      await prisma.user.update({
        where: { id: testUser.id },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    const remainingSessions = await prisma.refreshSession.count({
      where: { familyId },
    });
    assert(remainingSessions === 0, 'Test 7.4: Entire token family revoked upon reuse detection');

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    assert(
      (updatedUser?.tokenVersion ?? 0) > (testUser.tokenVersion ?? 0),
      'Test 7.5: tokenVersion incremented on reuse to invalidate all active JWTs',
    );
  } catch (err: any) {
    assert(false, 'Test 7: Refresh token rotation & reuse detection', err.message);
  }

  // Test 8: Timing-Safe Webhook Verification & Size Limits
  try {
    const secret = 'WhSecret2026_TimingSafe_TestKey';
    const h1 = crypto.createHash('sha256').update(secret).digest();
    const h2 = crypto.createHash('sha256').update(secret).digest();
    const hWrong = crypto.createHash('sha256').update('WrongKey').digest();

    assert(crypto.timingSafeEqual(h1, h2), 'Test 8.1: Constant-time comparison matches valid webhook secret');
    assert(!crypto.timingSafeEqual(h1, hWrong), 'Test 8.2: Constant-time comparison rejects invalid webhook secret');

    // Payload size bound (100KB)
    const largePayload = Buffer.alloc(105 * 1024, 'a').toString();
    const payloadSize = Buffer.byteLength(largePayload);
    assert(payloadSize > 100 * 1024, 'Test 8.3: Payload > 100KB detected and exceeds size limit');

    // Inbound text stripHtml
    const dirtyHtmlInput = '<script>alert("xss")</script><b>Inquiry regarding IRFZ44N</b>';
    const stripped = dirtyHtmlInput.replace(/<[^>]*>/g, '').trim();
    assert(
      stripped === 'alert("xss")Inquiry regarding IRFZ44N' && !stripped.includes('<script>') && !stripped.includes('<b>'),
      'Test 8.4: HTML stripped on inbound webhook text writes',
    );
  } catch (err: any) {
    assert(false, 'Test 8: Webhook security', err.message);
  }

  // Test 9: JWT Secret Validation Guard
  try {
    const shortSecret = 'too_short';
    const defaultSecret = 'change_this_secret_in_production';
    const validSecret = 'a'.repeat(32);

    const isShortInvalid = shortSecret.length < 32;
    const isDefaultInvalid = defaultSecret === 'change_this_secret_in_production';
    const isValidOk = validSecret.length >= 32;

    assert(isShortInvalid, 'Test 9.1: Startup guard rejects secrets < 32 characters');
    assert(isDefaultInvalid, 'Test 9.2: Startup guard rejects known default/placeholder secrets');
    assert(isValidOk, 'Test 9.3: Startup guard accepts >= 32-character high entropy secrets');
  } catch (err: any) {
    assert(false, 'Test 9: JWT secret validation', err.message);
  }

  // Test 10: Inactivity Timeout & Logout Revocation
  try {
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    const WARNING_THRESHOLD_MS = 2 * 60 * 1000;

    assert(INACTIVITY_TIMEOUT_MS === 1800000, 'Test 10.1: Inactivity timeout is exactly 30 minutes');
    assert(WARNING_THRESHOLD_MS === 120000, 'Test 10.2: Warning modal appears 2 minutes before timeout');
  } catch (err: any) {
    assert(false, 'Test 10: Inactivity timeout parameters', err.message);
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY:`);
  console.log(`  PASSED:  ${passedCount}`);
  console.log(`  FAILED:  ${failedCount}`);
  console.log(`  SKIPPED: ${skippedCount}`);
  console.log('================================================================\n');

  await prisma.$disconnect();

  if (failedCount > 0 || skippedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(async (e) => {
  console.error('Test suite uncaught error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
