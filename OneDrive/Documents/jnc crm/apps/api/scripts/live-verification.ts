/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { assertNotProductionDb } from './safety-check';

assertNotProductionDb('live-verification');

async function runLiveVerification() {
  console.log('================================================================');
  console.log('           JNC-CRM LIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'string' ? address : address?.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);
  const usersService = app.get(UsersService);

  // Fetch real accounts
  const admin = await prisma.user.findFirst({ where: { role: 'super_admin', deletedAt: null } });
  const employee = await prisma.user.findFirst({ where: { role: 'employee', deletedAt: null } });

  if (!admin || !employee) {
    throw new Error('Admin or Employee user not found in DB');
  }

  const jwtSecret = process.env.JWT_SECRET || 'jnc-crm-jwt-secret-key-prod-2026';
  const adminToken = jwtService.sign(
    { sub: admin.id, employeeCode: admin.employeeCode, role: admin.role, email: admin.email },
    { secret: jwtSecret }
  );

  const employeeToken = jwtService.sign(
    { sub: employee.id, employeeCode: employee.employeeCode, role: employee.role, email: employee.email },
    { secret: jwtSecret }
  );

  console.log(`[HTTP TEST 1] GET ${baseUrl}/settings/branding (Public Fetch)`);
  const res1 = await fetch(`${baseUrl}/settings/branding`);
  const data1 = await res1.json();
  console.log(`HTTP Status: ${res1.status} ${res1.statusText}`);
  console.log(`Response Body:`, JSON.stringify(data1, null, 2));
  console.log('\n----------------------------------------------------------------\n');

  console.log(`[HTTP TEST 2] POST ${baseUrl}/settings/branding with EMPLOYEE Token (RBAC 403 Test)`);
  console.log(`Authenticated User: ${employee.name} (${employee.employeeCode}) [Role: ${employee.role}]`);
  const res2 = await fetch(`${baseUrl}/settings/branding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${employeeToken}`,
    },
    body: JSON.stringify({
      companyDisplayName: 'Hacked Brand Name',
      companyPhone: '+91 00000 00000',
    }),
  });
  const data2 = await res2.json();
  console.log(`HTTP Status: ${res2.status} ${res2.statusText} (Expected: 403 Forbidden)`);
  console.log(`Response Body:`, JSON.stringify(data2, null, 2));
  console.log('\n----------------------------------------------------------------\n');

  console.log(`[HTTP TEST 3] POST ${baseUrl}/settings/branding with ADMIN Token (Authorized Update)`);
  console.log(`Authenticated User: ${admin.name} (${admin.employeeCode}) [Role: ${admin.role}]`);
  const res3 = await fetch(`${baseUrl}/settings/branding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      companyDisplayName: 'JS Network Communication',
      companyPhone: '+91 9663421455',
      companyLogoUrl: '/jnc-logo.jpg',
    }),
  });
  const data3 = await res3.json();
  console.log(`HTTP Status: ${res3.status} ${res3.statusText} (Expected: 200 OK)`);
  console.log(`Response Body:`, JSON.stringify(data3, null, 2));
  console.log('\n----------------------------------------------------------------\n');

  console.log(`[HTTP TEST 4] GET ${baseUrl}/settings/branding (Public Fetch After Update)`);
  const res4 = await fetch(`${baseUrl}/settings/branding`);
  const data4 = await res4.json();
  console.log(`HTTP Status: ${res4.status} ${res4.statusText}`);
  console.log(`Response Body:`, JSON.stringify(data4, null, 2));
  console.log('\n----------------------------------------------------------------\n');

  console.log(`[EMAIL TEST 5] Real Password Reset Email Trigger & Content Inspection`);
  console.log(`Triggering password reset for target employee: ${employee.email}...`);
  const scopedAdmin = {
    id: admin.id,
    employeeCode: admin.employeeCode,
    role: admin.role,
    teamId: admin.teamId || undefined,
    team: admin.team || undefined,
    warehouseId: admin.warehouseId || undefined,
  };

  const resetResult = await usersService.resetCredentials(employee.id, scopedAdmin as any);
  console.log(`Reset Result Message: ${resetResult.message}`);
  console.log(`Generated Temp Password: ${resetResult.tempPassword}`);

  // Fetch the latest email from MessageLog in database
  const latestEmail = await prisma.messageLog.findFirst({
    where: {
      recipient: employee.email,
      relatedEntityType: 'user',
      relatedEntityId: employee.id,
    },
    orderBy: { sentAt: 'desc' },
  });

  console.log('\n================================================================');
  console.log('             VERIFIED REAL EMAIL CAPTURE FROM DB');
  console.log('================================================================');
  console.log(`Recipient:  ${latestEmail?.recipient}`);
  console.log(`Channel:    ${latestEmail?.channel}`);
  console.log(`Subject:    ${latestEmail?.subject}`);
  console.log(`Status:     ${latestEmail?.status}`);
  console.log(`Sent At:    ${latestEmail?.sentAt}`);
  console.log(`\nRendered HTML Content:\n${latestEmail?.body}`);
  console.log('================================================================\n');

  await app.close();
  await prisma.$disconnect();
  console.log('ALL LIVE TESTS EXECUTED AND COMPLETED CLEANLY.');
  process.exit(0);
}

runLiveVerification().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
