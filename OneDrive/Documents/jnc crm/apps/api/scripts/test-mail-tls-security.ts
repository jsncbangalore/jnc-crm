/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as assert from 'assert';
import { isPrivateOrBlockedIp, isInternalHostname } from '../src/common/ssrf.util';
import { isCertificateError } from '../src/notifications/notifications.service';
import { SettingsService } from '../src/settings/settings.service';
import { ScopedUser } from '../src/auth/scoping.service';
import { encryptAtRest, decryptAtRest } from '../src/common/encryption.util';

let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          passedTests++;
          console.log(`[PASSED] ${name}`);
        })
        .catch((err) => {
          failedTests++;
          console.error(`[FAILED] ${name}: ${err.message}`);
        });
    } else {
      passedTests++;
      console.log(`[PASSED] ${name}`);
    }
  } catch (err: any) {
    failedTests++;
    console.error(`[FAILED] ${name}: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('\n================================================================');
  console.log('       JNC-CRM MAIL TLS & SMTP SECURITY VERIFICATION SUITE       ');
  console.log('================================================================\n');

  // Mock Prisma Service
  const mockMailAccounts: any[] = [];

  const mockPrisma: any = {
    mailAccount: {
      findMany: async (args: any) => {
        return mockMailAccounts
          .filter(a => a.tenantId === args.where.tenantId)
          .map(a => {
            const copy = { ...a };
            delete copy.smtpPass;
            return copy;
          });
      },
      findFirst: async (args: any) => {
        const found = mockMailAccounts.find(a => {
          if (args.where.id && a.id !== args.where.id) return false;
          if (args.where.tenantId && a.tenantId !== args.where.tenantId) return false;
          return true;
        });
        if (!found) return null;
        const copy = { ...found };
        if (args.select && !args.select.smtpPass) {
          delete copy.smtpPass;
        }
        return copy;
      },
      create: async (args: any) => {
        const record = {
          id: `mail-acc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        mockMailAccounts.push(record);
        const copy = { ...record };
        if (args.select && !args.select.smtpPass) {
          delete copy.smtpPass;
        }
        return copy;
      },
      updateMany: async (args: any) => {
        const match = mockMailAccounts.find(a => a.id === args.where.id && a.tenantId === args.where.tenantId);
        if (match) {
          for (const key of Object.keys(args.data)) {
            if (args.data[key] !== undefined) {
              match[key] = args.data[key];
            }
          }
        }
        return { count: match ? 1 : 0 };
      },
      deleteMany: async (args: any) => {
        const idx = mockMailAccounts.findIndex(a => a.id === args.where.id && a.tenantId === args.where.tenantId);
        if (idx !== -1) {
          mockMailAccounts.splice(idx, 1);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    user: {
      findUnique: async (args: any) => {
        return { id: args.where.id, email: 'admin@company.com' };
      },
    },
  };

  const settingsService = new SettingsService(mockPrisma);

  const testUser: ScopedUser = {
    id: 'user-admin-1',
    tenantId: 'tenant-123',
    employeeCode: 'EMP001',
    role: 'tenant_admin',
  };

  // ─── 1. CERTIFICATE ERROR DETECTION ──────────────────────────────────────
  runTest('Test 1.1: isCertificateError recognizes self-signed certificates', () => {
    assert.strictEqual(isCertificateError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }), true);
    assert.strictEqual(isCertificateError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }), true);
    assert.strictEqual(isCertificateError({ message: 'self signed certificate in certificate chain' }), true);
  });

  runTest('Test 1.2: isCertificateError recognizes expired and invalid certificates', () => {
    assert.strictEqual(isCertificateError({ code: 'CERT_HAS_EXPIRED' }), true);
    assert.strictEqual(isCertificateError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), true);
    assert.strictEqual(isCertificateError({ message: 'The mail server certificate is not trusted' }), true);
  });

  runTest('Test 1.3: isCertificateError returns false for normal network or auth errors', () => {
    assert.strictEqual(isCertificateError({ code: 'EAUTH', message: 'Invalid credentials' }), false);
    assert.strictEqual(isCertificateError({ code: 'ETIMEDOUT', message: 'Connection timed out' }), false);
    assert.strictEqual(isCertificateError({ code: 'ECONNREFUSED', message: 'Connection refused' }), false);
  });

  // ─── 2. SSRF GUARD & PRIVATE HOST BLOCKING ──────────────────────────────
  runTest('Test 2.1: SSRF Guard blocks IPv4 loopback (127.0.0.1)', () => {
    assert.strictEqual(isPrivateOrBlockedIp('127.0.0.1'), true);
    assert.strictEqual(isInternalHostname('localhost'), true);
    assert.strictEqual(isInternalHostname('127.0.0.1'), true);
  });

  runTest('Test 2.2: SSRF Guard blocks RFC 1918 private IPv4 networks (10.x, 172.16-31.x, 192.168.x)', () => {
    assert.strictEqual(isPrivateOrBlockedIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrBlockedIp('10.255.255.255'), true);
    assert.strictEqual(isPrivateOrBlockedIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateOrBlockedIp('172.31.255.255'), true);
    assert.strictEqual(isPrivateOrBlockedIp('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrBlockedIp('192.168.0.254'), true);
  });

  runTest('Test 2.3: SSRF Guard blocks Cloud Metadata IP (169.254.169.254) and link-local', () => {
    assert.strictEqual(isPrivateOrBlockedIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrBlockedIp('169.254.1.1'), true);
    assert.strictEqual(isInternalHostname('169.254.169.254'), true);
  });

  runTest('Test 2.4: SSRF Guard blocks IPv6 loopback (::1) and unique local (fc00::)', () => {
    assert.strictEqual(isPrivateOrBlockedIp('::1'), true);
    assert.strictEqual(isPrivateOrBlockedIp('fc00::1'), true);
    assert.strictEqual(isPrivateOrBlockedIp('fe80::1'), true);
  });

  runTest('Test 2.5: SSRF Guard permits valid public IP addresses', () => {
    assert.strictEqual(isPrivateOrBlockedIp('142.250.190.46'), false); // google.com
    assert.strictEqual(isPrivateOrBlockedIp('52.96.166.130'), false);  // outlook.com
  });

  await runTest('Test 2.6: testMailAccount rejects private host 127.0.0.1', async () => {
    const res = await settingsService.testMailAccount(testUser, {
      smtpHost: '127.0.0.1',
      smtpPort: 587,
      smtpUser: 'test@company.com',
      smtpPass: 'test-secret',
    });
    assert.strictEqual(res.result, 'port_blocked');
    assert.ok(res.message.includes('prohibited'));
  });

  await runTest('Test 2.7: testMailAccount rejects cloud metadata host 169.254.169.254', async () => {
    const res = await settingsService.testMailAccount(testUser, {
      smtpHost: '169.254.169.254',
      smtpPort: 465,
      smtpUser: 'test@company.com',
      smtpPass: 'test-secret',
    });
    assert.strictEqual(res.result, 'port_blocked');
    assert.ok(res.message.includes('prohibited'));
  });

  // ─── 3. BAD PORT BLOCKING ────────────────────────────────────────────────
  await runTest('Test 3.1: testMailAccount rejects unencrypted port 25', async () => {
    const portUser: ScopedUser = { ...testUser, id: 'user-port-test-1' };
    const res = await settingsService.testMailAccount(portUser, {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 25,
      smtpUser: 'test@company.com',
      smtpPass: 'test-secret',
    });
    assert.strictEqual(res.result, 'port_blocked');
    assert.ok(res.message.includes('Port 25 is not allowed'));
  });

  await runTest('Test 3.2: testMailAccount rejects arbitrary ports 22, 80, 8080', async () => {
    let idx = 0;
    for (const port of [22, 80, 8080]) {
      idx++;
      const arbitraryUser: ScopedUser = { ...testUser, id: `user-arbitrary-port-${idx}` };
      const res = await settingsService.testMailAccount(arbitraryUser, {
        smtpHost: 'smtp.gmail.com',
        smtpPort: port,
        smtpUser: 'test@company.com',
        smtpPass: 'test-secret',
      });
      assert.strictEqual(res.result, 'port_blocked');
    }
  });

  // ─── 4. PASSWORD LEAKAGE PREVENTION ───────────────────────────────────────
  await runTest('Test 4.1: createMailAccount stores password encrypted and never returns smtpPass', async () => {
    const plainPass = 'CompanySecretPassword123!';
    const created = await settingsService.createMailAccount(testUser, {
      name: 'Official Sales Mail',
      email: 'sales@company.com',
      senderName: 'Acme Sales',
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpUser: 'sales@company.com',
      smtpPass: plainPass,
      useForAllPurposes: true,
    });

    // Returned object MUST NOT have smtpPass
    assert.strictEqual((created as any).smtpPass, undefined);
    assert.strictEqual(created.email, 'sales@company.com');
    assert.strictEqual(created.purpose, 'ALL');
    assert.strictEqual(created.encryption, 'starttls');

    // Stored object in mock DB must be encrypted
    const stored = mockMailAccounts.find(a => a.id === created.id);
    assert.ok(stored.smtpPass !== plainPass);
    assert.strictEqual(decryptAtRest(stored.smtpPass), plainPass);
  });

  await runTest('Test 4.2: getMailAccounts never exposes smtpPass in list response', async () => {
    const list = await settingsService.getMailAccounts(testUser);
    assert.ok(list.length > 0);
    for (const acc of list) {
      assert.strictEqual((acc as any).smtpPass, undefined);
      assert.ok(['starttls', 'ssl'].includes(acc.encryption));
    }
  });

  await runTest('Test 4.3: updateMailAccount preserves old password when smtpPass is empty', async () => {
    const list = await settingsService.getMailAccounts(testUser);
    const target = list[0];
    const originalStoredPass = mockMailAccounts.find(a => a.id === target.id).smtpPass;

    // Update name and senderName with empty password
    const updated = await settingsService.updateMailAccount(testUser, target.id, {
      name: 'Updated Company Mail Account',
      smtpPass: '',
    });

    assert.strictEqual((updated as any).smtpPass, undefined);
    assert.strictEqual(updated.name, 'Updated Company Mail Account');

    // Stored password must be unchanged!
    const postUpdateStoredPass = mockMailAccounts.find(a => a.id === target.id).smtpPass;
    assert.strictEqual(originalStoredPass, postUpdateStoredPass);
  });

  // ─── 5. AUTO-DETECT PROVIDER ─────────────────────────────────────────────
  await runTest('Test 5.1: detectMailProvider auto-detects Gmail and Google Workspace', async () => {
    const res = await settingsService.detectMailProvider('user@gmail.com');
    assert.strictEqual(res.provider, 'google');
    assert.strictEqual(res.smtpHost, 'smtp.gmail.com');
    assert.strictEqual(res.smtpPort, 465);
    assert.strictEqual(res.encryption, 'ssl');
    assert.ok(res.notes.includes('App Password'));
  });

  await runTest('Test 5.2: detectMailProvider auto-detects Outlook and Microsoft 365', async () => {
    const res = await settingsService.detectMailProvider('user@outlook.com');
    assert.strictEqual(res.provider, 'microsoft365');
    assert.strictEqual(res.smtpHost, 'smtp.office365.com');
    assert.strictEqual(res.smtpPort, 587);
    assert.strictEqual(res.encryption, 'starttls');
  });

  await runTest('Test 5.3: detectMailProvider returns manual configuration for unknown domain', async () => {
    const res = await settingsService.detectMailProvider('contact@unregistered-nonexistent-domain-xyz123.com');
    assert.strictEqual(res.provider, 'custom');
    assert.strictEqual(res.smtpHost, '');
    assert.strictEqual(res.smtpPort, 587);
    assert.strictEqual(res.encryption, 'starttls');
  });

  // ─── 6. RATE LIMITING ────────────────────────────────────────────────────
  await runTest('Test 6.1: testMailAccount enforces 5 tests per 10 minutes limit per user', async () => {
    const rateLimitedUser: ScopedUser = {
      id: 'rate-limited-user-99',
      tenantId: 'tenant-123',
      employeeCode: 'EMP099',
      role: 'tenant_admin',
    };

    // Make 5 fast invalid calls (rejected by port check, still counting tests)
    for (let i = 0; i < 5; i++) {
      await settingsService.testMailAccount(rateLimitedUser, {
        smtpHost: '127.0.0.1',
        smtpPort: 25,
        smtpUser: 'test@company.com',
        smtpPass: 'test',
      });
    }

    // 6th call must throw BadRequestException
    let caughtError = false;
    try {
      await settingsService.testMailAccount(rateLimitedUser, {
        smtpHost: '127.0.0.1',
        smtpPort: 25,
        smtpUser: 'test@company.com',
        smtpPass: 'test',
      });
    } catch (err: any) {
      caughtError = true;
      assert.ok(err.message.includes('Rate limit exceeded'));
    }
    assert.strictEqual(caughtError, true, '6th test call should be rate limited');
  });

  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('\n----------------------------------------------------------------');
  console.log(`MAIL SECURITY TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error('Fatal error during test run:', e);
  process.exit(1);
});
