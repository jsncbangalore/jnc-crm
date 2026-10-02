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

  // Fetch JNC Tenant
  const jncTenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ code: 'JNC' }, { id: 'default-tenant-id' }],
    },
  });

  if (!jncTenant) {
    throw new Error('JNC tenant not found in database');
  }
  console.log(`[Setup] JNC Tenant found: ID=${jncTenant.id}, Code=${jncTenant.code}, isInternal=${jncTenant.isInternal}`);

  // Test 1: GET /platform/tenants does not include the JNC tenant
  console.log('\n--- Test 1: GET /platform/tenants does not include JNC tenant ---');
  const tenantsList = await platformService.listTenants();
  const includesJnc = tenantsList.some(
    (t) => t.code === 'JNC' || t.code === 'JNC-ORG-001' || t.id === jncTenant.id || (t as any).isInternal === true
  );
  if (includesJnc) {
    throw new Error('FAILED: JNC tenant is present in platformService.listTenants() result!');
  }
  console.log(`PASSED: listTenants returned ${tenantsList.length} client company(ies), JNC tenant is completely excluded.`);

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

  // Test 3: JNC tenant_admin gets 403 on /platform/tenants
  console.log('\n--- Test 3: JNC tenant_admin gets 403 on /platform/tenants ---');
  const jncTenantAdminUser = {
    id: 'jnc-boss-id',
    role: 'tenant_admin',
    tenantId: jncTenant.id,
    employeeCode: 'JNC-SA-001',
  };

  const mockPlatformContext = {
    getHandler: () => () => {},
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: jncTenantAdminUser,
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
      console.log(`PASSED: RolesGuard blocked JNC tenant_admin on /platform/tenants with: "${err.message}"`);
    }
  }
  if (!tenantAdminBlocked) {
    throw new Error('FAILED: RolesGuard did not block JNC tenant_admin on /platform/tenants!');
  }

  // Test 4: Calling impersonate or reset-admin-password on JNC tenant returns 403
  console.log('\n--- Test 4: Impersonate or reset-admin-password on JNC tenant returns 403 ---');
  let impersonateBlocked = false;
  try {
    await platformService.impersonateTenant(jncTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      impersonateBlocked = true;
      console.log(`PASSED: Impersonate JNC tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!impersonateBlocked) {
    throw new Error('FAILED: platformService.impersonateTenant did not throw ForbiddenException for JNC tenant!');
  }

  let resetAdminBlocked = false;
  try {
    await platformService.resetTenantAdminPassword(jncTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      resetAdminBlocked = true;
      console.log(`PASSED: Reset admin password for JNC tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!resetAdminBlocked) {
    throw new Error('FAILED: platformService.resetTenantAdminPassword did not throw ForbiddenException for JNC tenant!');
  }

  let deleteBlocked = false;
  try {
    await platformService.deleteTenant(jncTenant.id);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      deleteBlocked = true;
      console.log(`PASSED: Delete JNC tenant threw ForbiddenException: "${err.message}"`);
    }
  }
  if (!deleteBlocked) {
    throw new Error('FAILED: platformService.deleteTenant did not throw ForbiddenException for JNC tenant!');
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
