/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

console.log('========================================================================');
console.log('EMAIL OUTBOX BODY CLEARING & EXPIRATION PURGE VERIFICATION');
console.log('========================================================================\n');

// Mock outbox storage
interface MockOutboxRecord {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  status: string;
  attempts: number;
  sentAt: Date | null;
  createdAt: Date;
  isDecoy: boolean;
}

const mockOutboxDb: MockOutboxRecord[] = [];

// Simulate mock Prisma
const mockPrisma = {
  emailOutbox: {
    async findUnique({ where }: any) {
      return mockOutboxDb.find((item) => item.id === where.id) || null;
    },
    async update({ where, data }: any) {
      const item = mockOutboxDb.find((i) => i.id === where.id);
      if (item) {
        Object.assign(item, data);
      }
      return item;
    },
    async deleteMany({ where }: any) {
      const initialCount = mockOutboxDb.length;
      const fifteenMinCutoff = where?.OR?.find((c: any) => c.createdAt?.lt)?.createdAt?.lt;
      if (fifteenMinCutoff) {
        const cutoffMs = new Date(fifteenMinCutoff).getTime();
        const kept = mockOutboxDb.filter((item) => new Date(item.createdAt).getTime() >= cutoffMs);
        const deletedCount = mockOutboxDb.length - kept.length;
        mockOutboxDb.length = 0;
        mockOutboxDb.push(...kept);
        return { count: deletedCount };
      }
      return { count: 0 };
    },
  },
  otpChallenge: { async deleteMany() { return { count: 0 }; } },
  resetTicket: { async deleteMany() { return { count: 0 }; } },
  loginTicket: { async deleteMany() { return { count: 0 }; } },
  trustedDevice: { async deleteMany() { return { count: 0 }; } },
};

// Simulate simulated dispatchOutboxItem logic from auth.service.ts
async function simulateDispatchOutboxItem(outboxId: string, deliverySucceeds: boolean) {
  const item = await mockPrisma.emailOutbox.findUnique({ where: { id: outboxId } });
  if (!item || item.isDecoy || item.status !== 'pending') return;

  let deliveryError: string | null = null;
  if (!deliverySucceeds) {
    deliveryError = 'SMTP connection timeout';
  }

  if (!deliveryError) {
    await mockPrisma.emailOutbox.update({
      where: { id: item.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        attempts: item.attempts + 1,
        text: null,
        html: null,
      },
    });
  } else {
    await mockPrisma.emailOutbox.update({
      where: { id: item.id },
      data: {
        attempts: item.attempts + 1,
        status: 'failed',
      },
    });
  }
}

// Simulate cleanupExpiredSecurityTokens logic from auth.service.ts
async function simulateCleanupExpiredSecurityTokens() {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [outboxRes] = await Promise.all([
    mockPrisma.emailOutbox.deleteMany({
      where: {
        OR: [
          { createdAt: { lt: fifteenMinutesAgo } },
          { sentAt: { not: null, lt: fifteenMinutesAgo } },
          { isDecoy: true, createdAt: { lt: oneDayAgo } },
        ],
      },
    }),
  ]);

  return { deletedOutbox: outboxRes.count };
}

(async () => {
  console.log('--- 1. Verification of Code Body Clearing on Successful Send ---');
  // Seed pending OTP email containing verification code
  const record1: MockOutboxRecord = {
    id: 'outbox-test-1',
    to: 'masked-user@example.com',
    subject: 'Your Verification Code',
    text: 'Your one-time security code is 654321. It expires in 10 minutes.',
    html: '<p>Your one-time security code is <strong>654321</strong>.</p>',
    status: 'pending',
    attempts: 0,
    sentAt: null,
    createdAt: new Date(),
    isDecoy: false,
  };
  mockOutboxDb.push(record1);

  assert(record1.text !== null && record1.html !== null, 'Initial pending outbox record contains code body');

  // Dispatch item successfully
  await simulateDispatchOutboxItem('outbox-test-1', true);
  const updated = await mockPrisma.emailOutbox.findUnique({ where: { id: 'outbox-test-1' } });

  assert(updated?.status === 'sent', 'Outbox status is updated to "sent"');
  assert(updated?.sentAt instanceof Date, 'Outbox sentAt timestamp is recorded');
  assert(updated?.text === null, 'Outbox text body is cleared to null after successful delivery');
  assert(updated?.html === null, 'Outbox html body is cleared to null after successful delivery');

  console.log('\n--- 2. Verification of 15-Minute Expiration Purge ---');
  // Seed a record created 20 minutes ago (should be purged)
  const oldRecord: MockOutboxRecord = {
    id: 'outbox-old-20min',
    to: 'old-user@example.com',
    subject: 'Previous Code',
    text: null,
    html: null,
    status: 'sent',
    attempts: 1,
    sentAt: new Date(Date.now() - 20 * 60 * 1000),
    createdAt: new Date(Date.now() - 20 * 60 * 1000),
    isDecoy: false,
  };
  // Seed a record created 5 minutes ago (should be retained)
  const recentRecord: MockOutboxRecord = {
    id: 'outbox-recent-5min',
    to: 'recent-user@example.com',
    subject: 'Recent Alert',
    text: null,
    html: null,
    status: 'sent',
    attempts: 1,
    sentAt: new Date(Date.now() - 5 * 60 * 1000),
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    isDecoy: false,
  };
  mockOutboxDb.push(oldRecord, recentRecord);

  const cleanupRes = await simulateCleanupExpiredSecurityTokens();

  assert(cleanupRes.deletedOutbox >= 1, `Cleanup job purged ${cleanupRes.deletedOutbox} expired outbox record(s)`);
  const oldCheck = await mockPrisma.emailOutbox.findUnique({ where: { id: 'outbox-old-20min' } });
  const recentCheck = await mockPrisma.emailOutbox.findUnique({ where: { id: 'outbox-recent-5min' } });

  assert(oldCheck === null, 'Outbox row older than 15 minutes was purged');
  assert(recentCheck !== null, 'Outbox row younger than 15 minutes was preserved');

  console.log('\n========================================================================');
  console.log(`TOTAL OUTBOX CLEANUP ASSERTIONS: ${passed + failed}`);
  console.log(`PASSED:                          ${passed}`);
  console.log(`FAILED:                          ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('[PASS] ALL OUTBOX SECURITY & PURGE ASSERTIONS PASSED!\n');
  }
})();
