/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';

// Read-only CLI tool to report 2-step verification enrollment status per tenant and platform.
// Masks all emails (a***@d***.com) and never prints secrets.
// Usage: npm run admin:2fa-status [--check-predeploy] [--json]

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.com';
  const [localPart, domainPart] = email.toLowerCase().split('@');
  const firstLocal = localPart[0] || 'u';
  const domainSegments = domainPart.split('.');
  const firstDomain = domainSegments[0] ? domainSegments[0][0] : 'd';
  const tld = domainSegments.length > 1 ? domainSegments.slice(1).join('.') : 'com';
  return `${firstLocal}***@${firstDomain}***.${tld}`;
}

interface User2FaStatus {
  id: string;
  maskedEmail: string;
  role: string;
  enrolled: boolean;
  graceEndDate: string;
  daysRemaining: number | string;
  status: 'ENROLLED' | 'IN_GRACE' | 'FORCED_AT_NEXT_LOGIN' | 'GRACE_NOT_STARTED';
  lastLogin: string;
}

export async function compute2FaStatus(prisma: PrismaClient) {
  const now = Date.now();
  const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

  // 1. Platform Super Admins
  const platformUsers = await prisma.user.findMany({
    where: { role: 'platform_super_admin' },
    include: { twoFactor: true },
    orderBy: { createdAt: 'asc' },
  });

  // 2. Tenants and their users
  const tenants = await prisma.tenant.findMany({
    include: {
      users: {
        include: { twoFactor: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const mapUserStatus = (u: any): User2FaStatus => {
    const isEnrolled = Boolean(u.twoFactor && u.twoFactor.enabledAt);
    let graceEndDate = 'Not started';
    let daysRemaining: number | string = 'N/A';
    let status: User2FaStatus['status'] = 'ENROLLED';

    if (isEnrolled) {
      status = 'ENROLLED';
      daysRemaining = 'Enrolled';
      graceEndDate = 'Completed';
    } else if (u.firstLoginAfter2FaReleaseAt) {
      const releaseTime = new Date(u.firstLoginAfter2FaReleaseAt).getTime();
      const deadline = new Date(releaseTime + GRACE_PERIOD_MS);
      graceEndDate = deadline.toISOString().replace('T', ' ').substring(0, 19);

      if (now > deadline.getTime()) {
        status = 'FORCED_AT_NEXT_LOGIN';
        daysRemaining = 0;
      } else {
        status = 'IN_GRACE';
        daysRemaining = Math.max(1, Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000)));
      }
    } else {
      status = 'GRACE_NOT_STARTED';
      daysRemaining = '7 (upon login)';
      graceEndDate = 'Starts on login';
    }

    return {
      id: u.id,
      maskedEmail: maskEmail(u.email),
      role: u.role,
      enrolled: isEnrolled,
      graceEndDate,
      daysRemaining,
      status,
      lastLogin: u.lastLoginAt
        ? new Date(u.lastLoginAt).toISOString().replace('T', ' ').substring(0, 19)
        : 'Never',
    };
  };

  const platformStatuses: User2FaStatus[] = platformUsers.map(mapUserStatus);

  const tenantStatuses = tenants.map((t) => {
    // Users who must enrol: if tenant enforces 2fa, all active users; otherwise tenant_admin
    const requiredUsers = t.users.filter(
      (u) => t.requireTwoFactor || u.role === 'tenant_admin'
    );
    return {
      tenantId: t.id,
      tenantName: t.name,
      requireTwoFactor: Boolean(t.requireTwoFactor),
      users: requiredUsers.map(mapUserStatus),
    };
  });

  // Calculate aggregates
  let totalRequired = platformStatuses.length;
  let totalEnrolled = platformStatuses.filter((s) => s.enrolled).length;
  let totalInGrace = platformStatuses.filter((s) => s.status === 'IN_GRACE').length;
  let totalForcedAtNextLogin = platformStatuses.filter((s) => s.status === 'FORCED_AT_NEXT_LOGIN').length;
  let totalGraceNotStarted = platformStatuses.filter((s) => s.status === 'GRACE_NOT_STARTED').length;

  for (const t of tenantStatuses) {
    totalRequired += t.users.length;
    totalEnrolled += t.users.filter((s) => s.enrolled).length;
    totalInGrace += t.users.filter((s) => s.status === 'IN_GRACE').length;
    totalForcedAtNextLogin += t.users.filter((s) => s.status === 'FORCED_AT_NEXT_LOGIN').length;
    totalGraceNotStarted += t.users.filter((s) => s.status === 'GRACE_NOT_STARTED').length;
  }

  return {
    platform: platformStatuses,
    tenants: tenantStatuses,
    summary: {
      totalRequired,
      totalEnrolled,
      totalInGrace,
      totalGraceNotStarted,
      totalForcedAtNextLogin,
    },
  };
}

async function main() {
  const isPredeployCheck = process.argv.includes('--check-predeploy');
  const isJson = process.argv.includes('--json');

  const prisma = new PrismaClient();
  try {
    const report = await compute2FaStatus(prisma);

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('========================================================================');
    console.log('        JNC CRM 2-STEP VERIFICATION ENROLLMENT & GRACE STATUS           ');
    console.log('========================================================================\n');

    console.log('--- [PLATFORM SUPER ADMINS] ---');
    if (report.platform.length === 0) {
      console.log('  No platform super admins found.');
    } else {
      console.table(
        report.platform.map((p) => ({
          Email: p.maskedEmail,
          Role: p.role,
          Enrolled: p.enrolled ? 'YES' : 'NO',
          'Grace End': p.graceEndDate,
          'Days Left': p.daysRemaining,
          Status: p.status,
          'Last Login': p.lastLogin,
        }))
      );
    }
    console.log('');

    for (const t of report.tenants) {
      console.log(`--- [TENANT: ${t.tenantName} (${t.tenantId})] --- (Policy Enforced: ${t.requireTwoFactor ? 'YES' : 'NO'})`);
      if (t.users.length === 0) {
        console.log('  No users requiring 2FA in this tenant.');
      } else {
        console.table(
          t.users.map((u) => ({
            Email: u.maskedEmail,
            Role: u.role,
            Enrolled: u.enrolled ? 'YES' : 'NO',
            'Grace End': u.graceEndDate,
            'Days Left': u.daysRemaining,
            Status: u.status,
            'Last Login': u.lastLogin,
          }))
        );
      }
      console.log('');
    }

    console.log('========================================================================');
    console.log('                   PRE-DEPLOY 2-STEP SUMMARY                            ');
    console.log('========================================================================');
    console.log(`Total users requiring 2-step verification: ${report.summary.totalRequired}`);
    console.log(`Enrolled (2FA active):                     ${report.summary.totalEnrolled}`);
    console.log(`In grace period (days remaining):           ${report.summary.totalInGrace}`);
    console.log(`Grace period not yet started (pre-login):   ${report.summary.totalGraceNotStarted}`);
    console.log(`USERS FORCED AT NEXT LOGIN:                ${report.summary.totalForcedAtNextLogin}`);
    console.log('========================================================================\n');

    if (isPredeployCheck) {
      console.log(`[PRE-DEPLOY CHECK] ${report.summary.totalForcedAtNextLogin} user(s) will be forced to complete 2-step setup at their next login.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[ERROR] Failed to query 2FA status:', err);
    process.exit(1);
  });
}
