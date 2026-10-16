/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

require('ts-node').register({ project: 'apps/api/tsconfig.json' });

const { PlatformMailTestController, resetMailTestRateLimit } = require('../apps/api/src/platform/platform.controller');
const { RolesGuard } = require('../apps/api/src/auth/roles.guard');
const { ForbiddenException, HttpException } = require('@nestjs/common');

async function runTests() {
  console.log('=== PLATFORM MAIL-TEST CONTROLLER & GUARD SUITE ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Signed-in user email constraint
  try {
    resetMailTestRateLimit();
    const mockNotificationsService = {
      sendTestMail: async (email, reqId) => ({
        provider: 'brevo',
        status: 'sent',
        messageId: 'test-123',
        recipient: email,
        reqId,
      }),
    };
    const controller = new PlatformMailTestController(mockNotificationsService);
    const superAdminUser = { id: 'admin-1', email: 'superadmin@jsnc.co.in', role: 'platform_super_admin' };
    const req = { ip: '127.0.0.1', headers: { 'x-request-id': 'req-999' } };

    const res = await controller.sendMailTest(superAdminUser, req);
    if (res.recipient === 'superadmin@jsnc.co.in' && res.status === 'sent') {
      console.log('PASS 1: Only signed-in user email (superadmin@jsnc.co.in) is allowed as recipient.');
      passed++;
    } else {
      console.error('FAIL 1: Unexpected response', res);
      failed++;
    }
  } catch (err) {
    console.error('FAIL 1: Exception thrown', err);
    failed++;
  }

  // Test 2: Rate limit of 5 per hour
  try {
    resetMailTestRateLimit();
    const mockNotificationsService = {
      sendTestMail: async () => ({ provider: 'brevo', status: 'sent' }),
    };
    const controller = new PlatformMailTestController(mockNotificationsService);
    const superAdminUser = { id: 'admin-rate-1', email: 'superadmin@jsnc.co.in', role: 'platform_super_admin' };
    const req = { ip: '127.0.0.1' };

    for (let i = 0; i < 5; i++) {
      await controller.sendMailTest(superAdminUser, req);
    }
    console.log('PASS 2a: 5 consecutive test email requests within 1 hour succeeded.');

    try {
      await controller.sendMailTest(superAdminUser, req);
      console.error('FAIL 2b: 6th request within 1 hour did not throw rate limit error.');
      failed++;
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 429) {
        console.log('PASS 2b: 6th request correctly blocked with 429 Too Many Requests.');
        passed++;
      } else {
        console.error('FAIL 2b: Wrong exception type/status:', err);
        failed++;
      }
    }
  } catch (err) {
    console.error('FAIL 2: Exception in rate limit test', err);
    failed++;
  }

  // Test 3: RolesGuard blocks tenant_admin role
  try {
    const reflector = {
      getAllAndOverride: (key) => ['platform_super_admin'],
    };
    const guard = new RolesGuard(reflector);
    const tenantAdminContext = {
      getHandler: () => {},
      getClass: () => PlatformMailTestController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'tenant-user-1', role: 'tenant_admin', email: 'tenantadmin@client.com' },
        }),
      }),
    };

    try {
      await guard.canActivate(tenantAdminContext);
      console.error('FAIL 3: RolesGuard allowed tenant_admin to access platform mail-test.');
      failed++;
    } catch (err) {
      if (err instanceof ForbiddenException) {
        console.log('PASS 3: RolesGuard correctly rejected tenant_admin with 403 Forbidden.');
        passed++;
      } else {
        console.error('FAIL 3: Wrong exception type:', err);
        failed++;
      }
    }
  } catch (err) {
    console.error('FAIL 3: Exception in guard test', err);
    failed++;
  }

  console.log(`\nRESULTS: ${passed} PASSED, ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
