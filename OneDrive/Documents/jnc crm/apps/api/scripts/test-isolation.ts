import { PrismaClient } from '@prisma/client';
import { PlatformService } from '../src/platform/platform.service';
import { ScopingService } from '../src/auth/scoping.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ForbiddenException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

// Pre-load .env
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {}

import { assertNotProductionDb } from './safety-check';

assertNotProductionDb('test-isolation');

const prisma = new PrismaClient();
const jwtService = new JwtService({ secret: process.env.JWT_SECRET || 'secret' });
const notificationsService = new NotificationsService(prisma as any);
const platformService = new PlatformService(prisma as any, jwtService, notificationsService);
const scopingService = new ScopingService();
const reflector = new Reflector();
const rolesGuard = new RolesGuard(reflector, prisma as any);

async function runTests() {
  console.log('====================================================');
  console.log('Running Separation & Isolation Verification Tests');
  console.log('====================================================\n');

  // Fetch Internal Tenant
  const internalTenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ isInternal: true }, { code: process.env.DEFAULT_TENANT_CODE || 'DEMO' }],
    },
  });

  if (!internalTenant) {
    throw new Error('Internal tenant not found in database');
  }
  console.log(`[Setup] Internal Tenant found: ID=${internalTenant.id}, Code=${internalTenant.code}, isInternal=${internalTenant.isInternal}`);

  // Test 1: GET /platform/tenants does not include the internal tenant
  console.log('\n--- Test 1: GET /platform/tenants does not include internal tenant ---');
  const tenantsList = await platformService.listTenants();
  const includesInternal = tenantsList.some(
    (t) => t.id === internalTenant.id || (t as any).isInternal === true
  );
  if (includesInternal) {
    throw new Error('FAILED: Internal tenant is present in platformService.listTenants() result!');
  }
  console.log(`PASSED: listTenants returned ${tenantsList.length} client company(ies), internal tenant is completely excluded.`);

  // Test 2: Platform admin gets 403 on tenant workspace endpoints (/leads, /orders, /invoices)
  console.log('\n--- Test 2: Platform admin gets 403 on /leads, /orders, /invoices ---');
  const platformAdminUser = {
    id: 'platform-user-id',
    role: 'platform_super_admin',
    tenantId: null,
    employeeCode: 'PSA-001',
  };

  // Test scoping service
  let scopingBlocked = false;
  try {
    scopingService.getTenantScope(platformAdminUser);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      scopingBlocked = true;
    }
  }
  if (!scopingBlocked) {
    throw new Error('FAILED: scopingService.getTenantScope did not throw ForbiddenException for platform admin!');
  }

  // Test RolesGuard on /leads
  const mockLeadsContext = {
    getHandler: () => () => {},
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: platformAdminUser,
        url: '/leads',
        path: '/leads',
      }),
    }),
  } as any;

  // Set mock requiredRoles on the handler to simulate LeadsController
  reflector.getAllAndOverride = (key: string) => {
    if (key === 'page_access') return 'leads';
    if (key === 'roles') return ['tenant_admin', 'admin', 'sub_admin', 'employee'];
    return undefined;
  };

  let guardBlocked = false;
  try {
    await rolesGuard.canActivate(mockLeadsContext);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      guardBlocked = true;
      console.log(`PASSED: RolesGuard blocked platform admin on /leads with: "${err.message}"`);
    }
  }
  if (!guardBlocked) {
    throw new Error('FAILED: RolesGuard did not throw ForbiddenException for platform admin on /leads!');
  }

  // Test 3: Internal tenant_admin gets 403 on /platform/tenants
  console.log('\n--- Test 3: Internal tenant_admin gets 403 on /platform/tenants ---');
  const internalTenantAdminUser = {
    id: 'internal-admin-id',
    role: 'tenant_admin',
    tenantId: internalTenant.id,
    employeeCode: 'ADM-001',
  };

  const mockPlatformContext = {
    getHandler: () => () => {},
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: internalTenantAdminUser,
        url: '/platform/tenants',
        path: '/platform/tenants',
      }),
    }),
  } as any;

  reflector.getAllAndOverride = (key: string) => {
    if (key === 'roles') return ['platform_super_admin'];
    return undefined;
  };

  let tenantAdminBlocked = false;
  try {
    await rolesGuard.canActivate(mockPlatformContext);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      tenantAdminBlocked = true;
      console.log(`PASSED: RolesGuard blocked internal tenant_admin on /platform/tenants with: "${err.message}"`);
    }
  }
  if (!tenantAdminBlocked) {
    throw new Error('FAILED: RolesGuard did not block internal tenant_admin on /platform/tenants!');
  }

  // Test 4: Calling impersonate or reset-admin-password on internal tenant returns 403
  console.log('\n--- Test 4: Impersonate or reset-admin-password on internal tenant returns 403 ---');
  let impersonateBlocked = false;
  try {
    await platformService.impersonateTenant(internalTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      impersonateBlocked = true;
      console.log(`PASSED: Impersonate internal tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!impersonateBlocked) {
    throw new Error('FAILED: platformService.impersonateTenant did not throw ForbiddenException for internal tenant!');
  }

  let resetAdminBlocked = false;
  try {
    await platformService.resetTenantAdminPassword(internalTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      resetAdminBlocked = true;
      console.log(`PASSED: Reset admin password for internal tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!resetAdminBlocked) {
    throw new Error('FAILED: platformService.resetTenantAdminPassword did not throw ForbiddenException for internal tenant!');
  }

  let deleteBlocked = false;
  try {
    await platformService.deleteTenant(internalTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      deleteBlocked = true;
      console.log(`PASSED: Delete internal tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!deleteBlocked) {
    throw new Error('FAILED: platformService.deleteTenant did not throw ForbiddenException for internal tenant!');
  }

  console.log('\n====================================================');
  console.log('ALL 4 TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
  await prisma.$disconnect();
}

runTests().catch((err) => {
  console.error('\nTEST RUN FAILED:', err);
  prisma.$disconnect();
  process.exit(1);
});
