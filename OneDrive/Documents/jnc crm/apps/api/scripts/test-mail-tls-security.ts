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
import * as tls from 'tls';
import * as net from 'net';
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
  console.log('       CRM MAIL TLS & SMTP SECURITY VERIFICATION SUITE           ');
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
        return { id: args.where.id, email: 'admin@example.com' };
      },
    },
    accountLockout: {
      findUnique: async (args: any) => {
        return mockLockouts.find((l: any) => l.identityKey === args.where.identityKey) || null;
      },
      create: async (args: any) => {
        const row = { id: `lck-${Date.now()}`, ...args.data };
        mockLockouts.push(row);
        return row;
      },
      update: async (args: any) => {
        const match = mockLockouts.find((l: any) => l.identityKey === args.where.identityKey);
        if (match) {
          if (args.data.failedAttempts?.increment) {
            match.failedAttempts = (match.failedAttempts || 0) + args.data.failedAttempts.increment;
          } else if (typeof args.data.failedAttempts === 'number') {
            match.failedAttempts = args.data.failedAttempts;
          }
          if (args.data.lockedUntil !== undefined) match.lockedUntil = args.data.lockedUntil;
          if (args.data.lastAttemptAt !== undefined) match.lastAttemptAt = args.data.lastAttemptAt;
          return match;
        }
        return null;
      },
    },
  };

  const mockLockouts: any[] = [];
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

  const TEST_SELF_SIGNED_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDZMThVVRIpxB7q
yH7GUIpsyugfDPvolX8XsFKqGXugY33qxv9IxbVrvm5S6KxxsFlQNHnpoNbZUVBl
Mp/BPfcu+QuTI2ODUWfzye8dynsORqccXpbD8Rc+WGYBxV15WS+cZy8umRgxoK0V
CCbvVg1yDhgHaIhyng8L+AHPQP7si1/csMSzrN5KGv+zkZ1N5QhqS6tdcCP3+xWT
eZ3CqXQHae+CB/6SUV3qbTnIJt1ERqTNYZfIRxiJTgGbZTddjp6bOaJEl0WyH04U
7cmCKziR7kApvHb+jqIj0dMU6nAraHd+LxbQqjvInIrvAl1McLFpZRldiurf5W9o
TFzhDV7DAgMBAAECggEAUXqfkZOqjrSejKHOvYM1iv7L+eobDvQWi8KAIIQS1ua8
NDmXR6u0FcmJBd134+aueuJU4gqOz1Qr/urw98PRWXPgncBm8rq1bsXQyLJPW9mx
k3kAwl1NxPvQuNVb7cxBikFDeA3C/8sxY3R9dsgnnyQea5kRpz4YkvrlYuUVPZOS
z7EQKz+mzCP5kMEX8o1Rkz3wjQgNW5Pbvq57eWiDeCr9Z42PFi+J5pLKAWSJ9R68
aGZHY8fUwOY/u2Fy1IpOTkDLJyO5Ja5640B5ajbHEw1Xn6SWXHc7spILhuyYiY4c
B4ZF7ucah7DX8HViXxD0NiS3r4k6rFpllF1ZpV010QKBgQDzKGYXC4xvsJCjrKRc
EmQo6Dvjhi6n/3J8mcn8WIifhgkqu8swhVjFQx7dMJk7q8urXefqDjo4VhoUo80S
gXCltD8TRfaYssAzMs9FszGm5G1+ocw/lE8+HC9Nm80hLGtWhjGWkYb3mURwpX2o
9IjzBfS/pNcLd9ak7PBixK5N3QKBgQDkqcFxqDY8NK15J0ggj9oLNq5CjTeWoWkY
uvA6RSoL3yBx8sBD/AixacLu59PRWb+o34GCzlzWckVZd/JK6C8E3uh3y+Of7Pyu
SNAvhetVDvApdSbxtAjJSEckEK0xcaogDmUG6KQtmj6jQnHpa9d3V+m9iEvPBYuI
VY1vmOUlHwKBgAobT8L9c+TgjeJ/toUtLoSUwoh+d0n8UCHlsoOOmn8m7xKbo6Js
qHfqhknjTzsvtNN2n8EWvkzBJ2xcMpXmU2xPxZ9jdRB7vYljP0JCZHnvXK26w+aQ
n4qRWVX8d9Y9Jmj+QuljOxznffTArCxtnZOcV8PvchDD9mP8hTFVw3jxAoGBANq5
6tluXxquBPXr9ll3YMnzLzNn47GJin9mad5DRJoAgAefffxJ/ILAOP/P79TEtcmy
qi7WeQWEXwPa8YBnonpVQyc8d+sFhRqteb7LqjU9ycrOTkdLwE/RfINqFFFEecia
HFdEd69LaPk/2LjAOGXnSSXMVz+a/UKXG2iRZzdfAoGBALixbpBw/qRJykQc/N1V
DumIHs+b8/yrTDnYdoRHsL8irLvnc0J95UEdO0tdT+NUy2VMNohcT1XinRS/EdIb
glQ1YGqb1m6PIDLa6KvfoxnMXXyiBUjwaeMG3jPxtPQdtFu6WHB8ohBQ8p4vQaS+
+cXYMKd/Yi26oPolMNPnITgn
-----END PRIVATE KEY-----`;

  const TEST_SELF_SIGNED_CERT = `-----BEGIN CERTIFICATE-----
MIIDDzCCAfegAwIBAgIUffWcOX5UKE16xZ0U8SugJVYwyZUwDQYJKoZIhvcNAQEL
BQAwFzEVMBMGA1UEAwwMdGVzdC5pbnZhbGlkMB4XDTI2MTAyMDA1MTgwNFoXDTI3
MTAyMDA1MTgwNFowFzEVMBMGA1UEAwwMdGVzdC5pbnZhbGlkMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2TE4VVUSKcQe6sh+xlCKbMroHwz76JV/F7BS
qhl7oGN96sb/SMW1a75uUuiscbBZUDR56aDW2VFQZTKfwT33LvkLkyNjg1Fn88nv
Hcp7DkanHF6Ww/EXPlhmAcVdeVkvnGcvLpkYMaCtFQgm71YNcg4YB2iIcp4PC/gB
z0D+7Itf3LDEs6zeShr/s5GdTeUIakurXXAj9/sVk3mdwql0B2nvggf+klFd6m05
yCbdREakzWGXyEcYiU4Bm2U3XY6emzmiRJdFsh9OFO3Jgis4ke5AKbx2/o6iI9HT
FOpwK2h3fi8W0Ko7yJyK7wJdTHCxaWUZXYrq3+VvaExc4Q1ewwIDAQABo1MwUTAd
BgNVHQ4EFgQU1jtjSqEmwTpoyTmT33Nx7SBegbIwHwYDVR0jBBgwFoAU1jtjSqEm
wTpoyTmT33Nx7SBegbIwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC
AQEAjXEo/uMwWq1q3FkfgAhv+VPpc31OWjXR+R/cK/pHj3xCbGfZMON6gm4546+M
x9ZiuEztH63VwIpTkIjsBpOkNgt0R0U/pQ7LiyqoOLKA+yDOCfevrbqEYnR4jw5W
fbqutZG5+a2s4E77F7eE+LsScNYi7uKffE7POAMDcssnrmYjwfDg3S5nt63bhBNa
VG9nqb0ta/GAAGSS2wEfCwsXOjRti/Hg71D2CjeCr43B2g5l2NX1R+Q73egoR5Ot
gLyW3RCxPpDC08TnkSKPMMnmidc/J++9mSdZUlTt08KX2VHV5H+jaq9Xs3g0xmcb
Ajtro7PGI2wgVCnh2m4IRO4Fmw==
-----END CERTIFICATE-----`;

  await runTest('Test 1.4: Real TLS handshake with self-signed certificate server must fail with certificate_error', async () => {
    const server = tls.createServer({ key: TEST_SELF_SIGNED_KEY, cert: TEST_SELF_SIGNED_CERT }, (socket) => {
      socket.write('220 test.invalid ESMTP\r\n');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const handshakeError: any = await new Promise((resolve) => {
        const client = tls.connect({
          host: '127.0.0.1',
          port,
          servername: 'test.invalid',
        });
        client.on('error', (err) => resolve(err));
        client.on('secureConnect', () => {
          client.destroy();
          resolve(null);
        });
      });

      assert.ok(handshakeError, 'TLS handshake should have failed on unverified self-signed cert');
      assert.strictEqual(isCertificateError(handshakeError), true, 'Error should be identified as certificate error');

      let result = 'ok';
      let message = 'Connection verified';
      if (isCertificateError(handshakeError)) {
        result = 'certificate_error';
        message = 'The mail server certificate is not trusted';
      }
      assert.strictEqual(result, 'certificate_error');
      assert.strictEqual(message, 'The mail server certificate is not trusted');
    } finally {
      server.close();
    }
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
      smtpUser: 'test@example.com',
      smtpPass: 'test-secret',
    });
    assert.strictEqual(res.result, 'port_blocked');
    assert.ok(res.message.includes('prohibited'));
  });

  await runTest('Test 2.7: testMailAccount rejects cloud metadata host 169.254.169.254', async () => {
    const res = await settingsService.testMailAccount(testUser, {
      smtpHost: '169.254.169.254',
      smtpPort: 465,
      smtpUser: 'test@example.com',
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
      smtpUser: 'test@example.com',
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
        smtpUser: 'test@example.com',
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
      email: 'sales@example.com',
      senderName: 'Acme Sales',
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpUser: 'sales@example.com',
      smtpPass: plainPass,
      useForAllPurposes: true,
    });

    // Returned object MUST NOT have smtpPass
    assert.strictEqual((created as any).smtpPass, undefined);
    assert.strictEqual(created.email, 'sales@example.com');
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
    const res = await settingsService.detectMailProvider(['test', '@', 'gmail.com'].join(''));
    assert.strictEqual(res.provider, 'google');
    assert.strictEqual(res.smtpHost, 'smtp.gmail.com');
    assert.strictEqual(res.smtpPort, 465);
    assert.strictEqual(res.encryption, 'ssl');
    assert.ok(res.notes.includes('App Password'));
  });

  await runTest('Test 5.2: detectMailProvider auto-detects Outlook and Microsoft 365', async () => {
    const res = await settingsService.detectMailProvider('user@example.com');
    assert.strictEqual(res.provider, 'microsoft365');
    assert.strictEqual(res.smtpHost, 'smtp.office365.com');
    assert.strictEqual(res.smtpPort, 587);
    assert.strictEqual(res.encryption, 'starttls');
  });

  await runTest('Test 5.3: detectMailProvider returns manual configuration for unknown domain', async () => {
    const res = await settingsService.detectMailProvider('contact@example.com');
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
        smtpUser: 'test@example.com',
        smtpPass: 'test',
      });
    }

    // 6th call must throw BadRequestException
    let caughtError = false;
    try {
      await settingsService.testMailAccount(rateLimitedUser, {
        smtpHost: '127.0.0.1',
        smtpPort: 25,
        smtpUser: 'test@example.com',
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
