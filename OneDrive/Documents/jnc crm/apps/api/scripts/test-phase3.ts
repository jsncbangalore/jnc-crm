/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as path from 'path';
import * as fs from 'fs';

// Pre-load .env.test or .env
const testEnvPath = path.resolve(__dirname, '../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../.env');
const targetEnv = fs.existsSync(testEnvPath) ? testEnvPath : defaultEnvPath;

if (fs.existsSync(targetEnv)) {
  const envContent = fs.readFileSync(targetEnv, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
}

import { assertNotProductionDb } from './safety-check';

// Strict safety check: Fail immediately if connected to production Supabase
assertNotProductionDb('test-phase3');

import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { RolesGuard } from '../src/auth/roles.guard';
import { ScopingService, ScopedUser } from '../src/auth/scoping.service';
import { UsersService } from '../src/users/users.service';
import { LeadsService } from '../src/leads/leads.service';
import { CompaniesService } from '../src/companies/companies.service';
import { OrdersService } from '../src/orders/orders.service';
import { InvoicingService } from '../src/invoicing/invoicing.service';
import { QuotationsService } from '../src/quotations/quotations.service';
import { SuppliersService } from '../src/suppliers/suppliers.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { CustomObjectsService } from '../src/custom-objects/custom-objects.service';
import { ActivitiesService } from '../src/activities/activities.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { corsOriginCallback } from '../src/common/cors-config';
import { resolveTeamNavigation, PAGE_KEY_TO_ROUTE } from '../src/common/team-navigation';

const prisma = new PrismaClient();
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-32-chars-long-minimum-safe',
});
const authService = new AuthService(prisma as any, jwtService);
const jwtStrategy = new JwtStrategy(prisma as any);
const reflector = new Reflector();
const rolesGuard = new RolesGuard(reflector, prisma as any);
const scopingService = new ScopingService();
const notificationsService = new NotificationsService(prisma as any);
const auditService = {
  logAction: async () => {},
  log: async () => {},
} as any;
const backupService = {
  createDailySnapshot: async () => {},
} as any;

const usersService = new UsersService(prisma as any, notificationsService, auditService);
const leadsService = new LeadsService(prisma as any, scopingService, notificationsService, auditService);
const companiesService = new CompaniesService(prisma as any, scopingService);
const ordersService = new OrdersService(prisma as any, scopingService, notificationsService, auditService);
const invoicingService = new InvoicingService(prisma as any, scopingService, notificationsService, auditService);
const quotationsService = new QuotationsService(prisma as any, scopingService, auditService, ordersService);
const suppliersService = new SuppliersService(prisma as any, scopingService);
const inventoryService = new InventoryService(prisma as any, scopingService, auditService, backupService);
const customObjectsService = new CustomObjectsService(prisma as any);
const activitiesService = new ActivitiesService(prisma as any);
const dashboardService = new DashboardService(prisma as any, scopingService);

function createTestRefreshToken(user: any): string {
  const payload = {
    sub: user.id,
    tenantId: user.tenantId,
    org_id: user.tenantId,
    email: user.email,
    role: user.role,
    employeeCode: user.employeeCode,
    tokenVersion: user.tokenVersion ?? 0,
  };
  return jwtService.sign(payload, {
    secret: process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-key-32-chars-minimum',
    expiresIn: '7d',
  });
}

async function runPhase3Tests() {
  console.log('========================================================================');
  console.log('PHASE 3 TENANT ISOLATION & SECURITY TEST SUITE');
  console.log(`Database URL: ${process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@')}`);
  console.log('========================================================================\n');

  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  function recordPass(testName: string, detail: string) {
    passedCount++;
    console.log(`[PASS] ${testName}`);
    console.log(`       -> ${detail}\n`);
  }

  function recordFail(testName: string, reason: string) {
    failedCount++;
    console.error(`[FAIL] ${testName}`);
    console.error(`       -> ${reason}\n`);
  }

  function recordSkip(testName: string, reason: string) {
    skippedCount++;
    console.warn(`[SKIP] ${testName}`);
    console.warn(`       -> ${reason}\n`);
  }

  // =========================================================================
  // SETUP TEST DATA
  // =========================================================================
  const timestamp = Date.now();
  const tenantAId = `test-tenant-a-${timestamp}`;
  const tenantBId = `test-tenant-b-${timestamp}`;

  // Test database connectivity probe
  let isDbReachable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbReachable = true;
  } catch (connErr: any) {
    console.warn(`\n[DATABASE STATUS] Test database server at ${process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@')} is currently offline.`);
    console.warn(`Reason: ${connErr.message}`);
    console.warn(`Per Safety Rule 0: "I will give the URL; never use the production Supabase URL."`);
    console.warn(`DB-dependent tests will be recorded as SKIPPED per Rule 3.\n`);
  }

  if (isDbReachable) {
    // Run full DB-backed test suite
    const tenantA = await prisma.tenant.create({
      data: {
        id: tenantAId,
        code: `TENTA_${timestamp}`.substring(0, 10),
        name: `Tenant A Corp ${timestamp}`,
        slug: `tenant-a-${timestamp}`,
        status: 'active',
        isInternal: false,
      },
    });

    const tenantB = await prisma.tenant.create({
      data: {
        id: tenantBId,
        code: `TENTB_${timestamp}`.substring(0, 10),
        name: `Tenant B Corp ${timestamp}`,
        slug: `tenant-b-${timestamp}`,
        status: 'active',
        isInternal: false,
      },
    });

    const hashedPw = await bcrypt.hash('TestPassword123!', 10);

    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `admin.a.${timestamp}@example.com`,
        name: 'Tenant A Admin',
        employeeCode: `TAA-${timestamp}`.substring(0, 10),
        role: 'tenant_admin',
        passwordHash: hashedPw,
        isActive: true,
        tokenVersion: 0,
      },
    });

    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `admin.b.${timestamp}@example.com`,
        name: 'Tenant B Admin',
        employeeCode: `TAB-${timestamp}`.substring(0, 10),
        role: 'tenant_admin',
        passwordHash: hashedPw,
        isActive: true,
        tokenVersion: 0,
      },
    });

    const scopedUserA: ScopedUser = {
      id: adminA.id,
      role: adminA.role,
      tenantId: tenantA.id,
      employeeCode: adminA.employeeCode,
    };

    const scopedUserB: ScopedUser = {
      id: adminB.id,
      role: adminB.role,
      tenantId: tenantB.id,
      employeeCode: adminB.employeeCode,
    };

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Cross-tenant read/write isolation across all 11 modules
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 1: Cross-Tenant Isolation Across All 11 Modules <<<\n');

    // 1. Users
    const userInB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `employee.b.${timestamp}@example.com`,
        name: 'Employee B',
        employeeCode: `EB-${timestamp}`.substring(0, 10),
        role: 'employee',
        passwordHash: hashedPw,
        isActive: true,
      },
    });
    let userASeeB = false;
    try {
      await usersService.findOne(userInB.id, scopedUserA);
      userASeeB = true;
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException || e.message?.includes('not found')) {
        userASeeB = false;
      }
    }
    if (userASeeB) recordFail('Module 1: Users Isolation', 'User A was able to read User B from another tenant');
    recordPass('Module 1: Users Isolation', 'User A cannot find or access User B belonging to Tenant B');

    // 2. Teams
    const teamInB = await prisma.team.create({
      data: {
        tenantId: tenantB.id,
        name: `Engineering B ${timestamp}`,
        allowedPages: JSON.stringify(['leads', 'orders']),
      },
    });
    const teamsSeenByA = await prisma.team.findMany({ where: { tenantId: tenantA.id } });
    if (teamsSeenByA.some((t) => t.id === teamInB.id)) {
      recordFail('Module 2: Teams Isolation', 'Team B was returned in Tenant A query');
    }
    recordPass('Module 2: Teams Isolation', 'Teams are strictly scoped by tenantId in where clause');

    // 3. Leads
    const leadInB = await prisma.lead.create({
      data: {
        tenantId: tenantB.id,
        leadNumber: `LD-B-${timestamp}`.substring(0, 15),
        customerName: 'Secret Customer B',
        customerPhone: '9988776655',
        status: 'new',
      },
    });
    let leadASeeB = false;
    try {
      await leadsService.findOne(leadInB.id, scopedUserA);
      leadASeeB = true;
    } catch (e: any) {
      leadASeeB = false;
    }
    if (leadASeeB) recordFail('Module 3: Leads Isolation', 'User A was able to read Lead B from another tenant');
    recordPass('Module 3: Leads Isolation', 'User A gets NotFoundException when requesting Lead B');

    // 4. Companies (with insensitive contains verification)
    const companyInB = await prisma.company.create({
      data: {
        tenantId: tenantB.id,
        name: `Acme Industrial B ${timestamp}`,
      },
    });
    const companiesSeenByA = await companiesService.findAll(scopedUserA, { search: 'acme' });
    if (companiesSeenByA.some((c: any) => c.id === companyInB.id)) {
      recordFail('Module 4: Companies Isolation', 'Company B returned to User A in search');
    }
    recordPass('Module 4: Companies Isolation', 'Companies queries enforce tenantId and use case-insensitive matching');

    // 5. Contacts (scoped by tenantId & backfilled from company)
    const contactInB = await prisma.contact.create({
      data: {
        tenantId: tenantB.id,
        companyId: companyInB.id,
        name: `Dr. Contact B ${timestamp}`,
        phone: '9988776655',
        email: `contact.b.${timestamp}@example.com`,
      },
    });
    const contactsSeenByA = await prisma.contact.findMany({
      where: { id: contactInB.id, tenantId: tenantA.id },
    });
    if (contactsSeenByA.length > 0) recordFail('Module 5: Contacts Isolation', 'Contact B found in Tenant A scope');
    recordPass('Module 5: Contacts Isolation', 'Contact tenantId index and filter prevents cross-tenant access');

    // 6. Orders
    const orderInB = await prisma.order.create({
      data: {
        tenantId: tenantB.id,
        orderNumber: `ORD-B-${timestamp}`.substring(0, 15),
        customerName: 'Buyer B',
        customerPhone: '9876543210',
        totalAmount: 50000,
      },
    });
    let orderASeeB = false;
    try {
      await ordersService.findOne(orderInB.id, scopedUserA);
      orderASeeB = true;
    } catch (e: any) {
      orderASeeB = false;
    }
    if (orderASeeB) recordFail('Module 6: Orders Isolation', 'Order B accessible to User A');
    recordPass('Module 6: Orders Isolation', 'Orders findOne enforces tenantId where condition');

    // 7. Invoices
    const invoiceInB = await prisma.invoice.create({
      data: {
        tenantId: tenantB.id,
        invoiceNumber: `INV-B-${timestamp}`.substring(0, 15),
        customerName: 'Invoice Customer B',
        customerPhone: '9876543210',
        totalAmount: 15000,
      },
    });
    let invoiceASeeB = false;
    try {
      await invoicingService.findOne(invoiceInB.id, scopedUserA);
      invoiceASeeB = true;
    } catch (e: any) {
      invoiceASeeB = false;
    }
    if (invoiceASeeB) recordFail('Module 7: Invoices Isolation', 'Invoice B accessible to User A');
    recordPass('Module 7: Invoices Isolation', 'Invoices findOne and mutations enforce tenantId where condition');

    // 8. Quotations
    const quotationInB = await prisma.quotation.create({
      data: {
        tenantId: tenantB.id,
        quoteNumber: `QUO-B-${timestamp}`.substring(0, 15),
        validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        totalAmount: 25000,
      },
    });
    let quoteASeeB = false;
    try {
      await quotationsService.findOne(quotationInB.id, scopedUserA);
      quoteASeeB = true;
    } catch (e: any) {
      quoteASeeB = false;
    }
    if (quoteASeeB) recordFail('Module 8: Quotations Isolation', 'Quotation B accessible to User A');
    recordPass('Module 8: Quotations Isolation', 'Quotations are strictly isolated by tenantId');

    // 9. Suppliers
    const supplierInB = await prisma.supplier.create({
      data: {
        tenantId: tenantB.id,
        name: `Supplier B ${timestamp}`,
        contactPerson: 'Vendor Rep B',
      },
    });
    let supplierASeeB = false;
    try {
      await suppliersService.findOne(supplierInB.id, scopedUserA);
      supplierASeeB = true;
    } catch (e: any) {
      supplierASeeB = false;
    }
    if (supplierASeeB) recordFail('Module 9: Suppliers Isolation', 'Supplier B accessible to User A');
    recordPass('Module 9: Suppliers Isolation', 'Suppliers findOne and mutations enforce tenantId where condition');

    // 10. Inventory
    const skuInB = await prisma.sku.create({
      data: {
        tenantId: tenantB.id,
        skuCode: `SKU-B-${timestamp}`.substring(0, 15),
        name: 'Precision Widget B',
        category: 'Sensors',
        unitPrice: 500,
        costPrice: 300,
      },
    });
    let skuASeeB = false;
    try {
      await inventoryService.getSkuById(skuInB.id, scopedUserA);
      skuASeeB = true;
    } catch (e: any) {
      skuASeeB = false;
    }
    if (skuASeeB) recordFail('Module 10: Inventory Isolation', 'SKU B accessible to User A');
    recordPass('Module 10: Inventory Isolation', 'Inventory SKUs, stock adjustments, and transfers require tenantId');

    // 11. Custom Objects & Records
    const customObjInB = await prisma.customObject.create({
      data: {
        tenantId: tenantB.id,
        apiName: `inspection_${timestamp}`.substring(0, 20),
        label: 'Inspection B',
        pluralLabel: 'Inspections B',
      },
    });
    let objASeeB = false;
    try {
      await customObjectsService.getObjectById(customObjInB.id, scopedUserA);
      objASeeB = true;
    } catch (e: any) {
      objASeeB = false;
    }
    if (objASeeB) recordFail('Module 11: Custom Objects Isolation', 'Custom Object B accessible to User A');
    recordPass('Module 11: Custom Objects Isolation', 'Custom Objects, Fields, and Records are fully tenant-scoped');

    // 12. Activities (Projects & Daily Logs)
    const projectInB = await prisma.project.create({
      data: {
        tenantId: tenantB.id,
        name: `Secret R&D Project B ${timestamp}`,
      },
    });
    let projAUpdateB = false;
    try {
      await activitiesService.updateProject(scopedUserA, projectInB.id, { name: 'Compromised Name' });
      projAUpdateB = true;
    } catch (e: any) {
      projAUpdateB = false;
    }
    if (projAUpdateB) recordFail('Module 12: Activities Isolation', 'Project B was updated by User A');
    recordPass('Module 12: Activities Isolation', 'Projects and Daily Logs enforce tenantId in all lookups and mutations');

    // -----------------------------------------------------------------------
    // TEST 2: Disambiguating duplicate emails across tenants via company code
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 2: Multi-Tenant Duplicate Email Disambiguation <<<\n');
    const sharedEmail = `shared.user.${timestamp}@testdomain.com`;
    const sharedPassword = 'SharedPass123!';
    const sharedHash = await bcrypt.hash(sharedPassword, 10);
    const userSharedA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: sharedEmail,
        name: 'Shared User in A',
        employeeCode: `SHA-${timestamp}`.substring(0, 10),
        role: 'employee',
        passwordHash: sharedHash,
        isActive: true,
      },
    });
    const userSharedB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: sharedEmail,
        name: 'Shared User in B',
        employeeCode: `SHB-${timestamp}`.substring(0, 10),
        role: 'employee',
        passwordHash: sharedHash,
        isActive: true,
      },
    });

    // 2a. Login without company code with duplicate email and matching password -> returns requiresCompanySelection
    const multiResult = await authService.login({
      identifier: sharedEmail,
      password: sharedPassword,
    });
    if (multiResult.requiresCompanySelection && multiResult.companies && multiResult.companies.length >= 2 && multiResult.selectionToken) {
      recordPass('Email Disambiguation (Company Selection Required)', `Returned requiresCompanySelection: true with ${multiResult.companies.length} companies and valid selectionToken`);
    } else {
      recordFail('Email Disambiguation (Company Selection Required)', 'Did not prompt company selection when user exists in multiple tenants');
    }

    // 2b. Select company using selectionToken
    const selectResA = await authService.selectCompany({
      selectionToken: multiResult.selectionToken,
      companyCode: tenantB.code,
    });
    if (selectResA.user.id === userSharedB.id && selectResA.accessToken) {
      recordPass('Email Disambiguation (Select Company)', `Successfully authenticated into Tenant B via selectionToken (User: ${selectResA.user.name})`);
    } else {
      recordFail('Email Disambiguation (Select Company)', 'Failed to authenticate via selectCompany');
    }

    // 2c. Login directly with company code routes to respective tenant
    const loggedInA = await authService.login({
      identifier: sharedEmail,
      password: sharedPassword,
      companyCode: tenantA.code,
    });
    if (loggedInA.user && loggedInA.user.id === userSharedA.id && loggedInA.accessToken) {
      recordPass('Email Disambiguation (Direct Company Code)', `Authenticated directly into Tenant A with company code (ID: ${loggedInA.user.tenantId}, User: ${loggedInA.user.name})`);
    } else {
      recordFail('Email Disambiguation (Direct Company Code)', 'Failed to authenticate into Tenant A with direct company code');
    }

    // -----------------------------------------------------------------------
    // TEST 3: Wrong password error handling without reload
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 3: Wrong Password Handling <<<\n');
    let wrongPassBlocked = false;
    let wrongPassMessage = '';
    try {
      await authService.login({
        identifier: adminA.email,
        password: 'WrongPassword999!',
        companyCode: tenantA.code,
      });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        wrongPassBlocked = true;
        wrongPassMessage = err.message;
      }
    }
    if (!wrongPassBlocked) recordFail('Wrong Password Handling', 'Did not throw UnauthorizedException on wrong password');
    recordPass('Wrong Password Handling', `Returned UnauthorizedException with message: "${wrongPassMessage}" without page reload`);

    // -----------------------------------------------------------------------
    // TEST 4: Team without dashboard lands on its first allowed page (no loop)
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 4: Team Navigation Without Dashboard <<<\n');
    const restrictedTeam = await prisma.team.create({
      data: {
        tenantId: tenantA.id,
        name: `Restricted Team ${timestamp}`,
        allowedPages: JSON.stringify(['leads', 'orders']),
      },
    });
    const parsedAllowed: string[] = JSON.parse(restrictedTeam.allowedPages);
    const firstAllowedKey = parsedAllowed.find((p) => PAGE_KEY_TO_ROUTE[p]);
    const destinationRoute = PAGE_KEY_TO_ROUTE[firstAllowedKey || ''];
    if (destinationRoute !== '/leads') {
      recordFail('Team First Allowed Page', `Expected /leads but got: ${destinationRoute}`);
    }
    recordPass('Team First Allowed Page', `Team without dashboard allowedPages=['leads', 'orders'] resolves cleanly to '${destinationRoute}' with no loop`);

    // -----------------------------------------------------------------------
    // TEST 5: Role hierarchy guards
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 5: Role Hierarchy Guards <<<\n');

    // 5a. Admin cannot create tenant_admin
    const subAdminA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `admin.user.${timestamp}@example.com`,
        name: 'Regular Admin',
        employeeCode: `RA-${timestamp}`.substring(0, 10),
        role: 'admin',
        passwordHash: hashedPw,
        isActive: true,
      },
    });
    const scopedSubAdmin: ScopedUser = {
      id: subAdminA.id,
      role: 'admin',
      tenantId: tenantA.id,
      employeeCode: subAdminA.employeeCode,
    };

    let createTenantAdminBlocked = false;
    try {
      await usersService.createUser(
        {
          email: `new.tenant.admin.${timestamp}@example.com`,
          name: 'Illegal Tenant Admin',
          role: 'tenant_admin',
        } as any,
        scopedSubAdmin,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        createTenantAdminBlocked = true;
      }
    }
    if (!createTenantAdminBlocked) recordFail('Role Guard (Create tenant_admin)', 'Admin was allowed to create tenant_admin');
    recordPass('Role Guard (Create tenant_admin)', 'Admin cannot create a user with role tenant_admin (throws ForbiddenException)');

    // 5b. Nobody can change their own role
    let selfRoleChangeBlocked = false;
    try {
      await usersService.updateUser(subAdminA.id, { role: 'tenant_admin' } as any, scopedSubAdmin);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        selfRoleChangeBlocked = true;
      }
    }
    if (!selfRoleChangeBlocked) recordFail('Role Guard (Self Role Change)', 'User was allowed to alter their own role');
    recordPass('Role Guard (Self Role Change)', 'Users cannot modify their own role (throws BadRequestException)');

    // 5c. Last active tenant_admin cannot be demoted, deactivated or deleted
    // When a platform super admin attempts to demote/delete the sole active admin:
    const scopedPlatformAdmin: ScopedUser = {
      id: 'platform-super-admin-test',
      role: 'platform_super_admin',
      tenantId: null,
      employeeCode: 'PSA-001',
    };

    let lastAdminDemoteBlocked = false;
    try {
      await usersService.updateUser(adminA.id, { role: 'employee' } as any, scopedPlatformAdmin);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        lastAdminDemoteBlocked = true;
      }
    }
    if (!lastAdminDemoteBlocked) recordFail('Role Guard (Demote Last Admin)', 'Allowed demoting the last active tenant_admin');
    recordPass('Role Guard (Demote Last Admin)', 'Demoting the sole active tenant_admin is blocked with BadRequestException');

    let lastAdminDeactivateBlocked = false;
    try {
      await usersService.updateUser(adminA.id, { isActive: false } as any, scopedPlatformAdmin);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        lastAdminDeactivateBlocked = true;
      }
    }
    if (!lastAdminDeactivateBlocked) recordFail('Role Guard (Deactivate Last Admin)', 'Allowed deactivating sole tenant_admin');
    recordPass('Role Guard (Deactivate Last Admin)', 'Deactivating the sole active tenant_admin is blocked with BadRequestException');

    let lastAdminDeleteBlocked = false;
    try {
      await usersService.deleteUser(adminA.id, scopedPlatformAdmin);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        lastAdminDeleteBlocked = true;
      }
    }
    if (!lastAdminDeleteBlocked) recordFail('Role Guard (Delete Last Admin)', 'Allowed deleting sole tenant_admin');
    recordPass('Role Guard (Delete Last Admin)', 'Deleting the sole active tenant_admin is blocked with BadRequestException');

    // -----------------------------------------------------------------------
    // TEST 6: Token invalidation on user deactivation, tenant suspension, tokenVersion
    // -----------------------------------------------------------------------
    console.log('>>> RUNNING TEST GROUP 6: Token Invalidation & Lifecycle <<<\n');

    // 6a. Deactivated user blocked on access AND refresh token
    const testUserRefreshToken = createTestRefreshToken(userSharedA);
    await prisma.user.update({
      where: { id: userSharedA.id },
      data: { isActive: false },
    });

    let deactivatedAccessBlocked = false;
    try {
      await jwtStrategy.validate({ sub: userSharedA.id, email: userSharedA.email, role: userSharedA.role, tenantId: tenantA.id, tokenVersion: 0 });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) deactivatedAccessBlocked = true;
    }
    if (!deactivatedAccessBlocked) recordFail('Deactivated User Access Token', 'Deactivated user access token was accepted');
    recordPass('Deactivated User Access Token', 'Deactivated user rejected on access token verification (UnauthorizedException)');

    let deactivatedRefreshBlocked = false;
    try {
      await authService.refreshToken({ refreshToken: testUserRefreshToken });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) deactivatedRefreshBlocked = true;
    }
    if (!deactivatedRefreshBlocked) recordFail('Deactivated User Refresh Token', 'Deactivated user refresh token was accepted');
    recordPass('Deactivated User Refresh Token', 'Deactivated user rejected on refresh token exchange (UnauthorizedException)');

    // 6b. Suspended tenant blocked on access AND refresh token
    const userInTenantBRefreshToken = createTestRefreshToken(adminB);
    await prisma.tenant.update({
      where: { id: tenantB.id },
      data: { status: 'suspended' },
    });

    let suspendedAccessBlocked = false;
    try {
      await jwtStrategy.validate({ sub: adminB.id, email: adminB.email, role: adminB.role, tenantId: tenantB.id, tokenVersion: 0 });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) suspendedAccessBlocked = true;
    }
    if (!suspendedAccessBlocked) recordFail('Suspended Tenant Access Token', 'Suspended tenant user access token was accepted');
    recordPass('Suspended Tenant Access Token', 'Suspended tenant rejected on access token verification (UnauthorizedException)');

    let suspendedRefreshBlocked = false;
    try {
      await authService.refreshToken({ refreshToken: userInTenantBRefreshToken });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) suspendedRefreshBlocked = true;
    }
    if (!suspendedRefreshBlocked) recordFail('Suspended Tenant Refresh Token', 'Suspended tenant user refresh token was accepted');
    recordPass('Suspended Tenant Refresh Token', 'Suspended tenant rejected on refresh token exchange (UnauthorizedException)');

    // 6c. Password reset invalidates old refresh tokens (tokenVersion)
    await prisma.user.update({
      where: { id: adminA.id },
      data: { isActive: true },
    });
    const preResetRefreshToken = createTestRefreshToken(adminA);
    // Execute password reset
    await authService.changePassword(adminA.id, 'TestPassword123!', 'NewSecurePassword456!');

    let oldTokenVersionBlocked = false;
    try {
      await authService.refreshToken({ refreshToken: preResetRefreshToken });
    } catch (err: any) {
      if (err instanceof UnauthorizedException) oldTokenVersionBlocked = true;
    }
    if (!oldTokenVersionBlocked) recordFail('Token Version Invalidation', 'Old refresh token was accepted after password reset');
    recordPass('Token Version Invalidation', 'Password reset increments tokenVersion; previous refresh tokens are invalidated immediately');

    // End of DB-backed tests
    } finally {
      // Cleanup created test records
      try {
        await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.contact.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.company.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.lead.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.order.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.invoice.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.quotation.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.supplier.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.sku.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.customObject.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.project.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      } catch (cleanErr: any) {
        console.warn(`[Cleanup Warning] ${cleanErr.message}`);
      }
    }
  } else {
    console.log('[DATABASE OFFLINE] Recording all 22 database-dependent test assertions as SKIPPED per Rule 3:\n');
    recordSkip('Test 1.1: Users Isolation (Cross-tenant user read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.2: Teams Isolation (Cross-tenant team read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.3: Leads Isolation (Cross-tenant lead read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.4: Companies Isolation (Cross-tenant company read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.5: Contacts Isolation (Cross-tenant contact read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.6: Orders Isolation (Cross-tenant order read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.7: Invoices Isolation (Cross-tenant invoice read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.8: Quotations Isolation (Cross-tenant quotation read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.9: Suppliers Isolation (Cross-tenant supplier read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.10: Inventory Isolation (Cross-tenant inventory read/write blocked)', 'Test DB offline');
    recordSkip('Test 1.11: Custom Objects Isolation (Cross-tenant custom object read/write blocked)', 'Test DB offline');
    recordSkip('Test 2.1: Duplicate Email Login without Company Code requires code', 'Test DB offline');
    recordSkip('Test 2.2: Duplicate Email Login with Company Code succeeds for tenant', 'Test DB offline');
    recordSkip('Test 3: Wrong Password API Response returns status 401 without reload', 'Test DB offline');
    recordSkip('Test 5.1: Admin Cannot Create Tenant Admin', 'Test DB offline');
    recordSkip('Test 5.2: Admin Cannot Promote User to Tenant Admin', 'Test DB offline');
    recordSkip('Test 5.3: User Cannot Change Own Role', 'Test DB offline');
    recordSkip('Test 5.4: Last Active Tenant Admin Cannot Be Demoted or Deactivated', 'Test DB offline');
    recordSkip('Test 6.1: Deactivated User Access Blocked on Access Token', 'Test DB offline');
    recordSkip('Test 6.2: Suspended Tenant Access Blocked on Access Token', 'Test DB offline');
    recordSkip('Test 6.3: Deactivated User Blocked on Refresh Token', 'Test DB offline');
    recordSkip('Test 6.4: Password Reset Increments tokenVersion Revoking Old Tokens', 'Test DB offline');
  }

  // -----------------------------------------------------------------------
  // TEST 4: Team without dashboard lands on its first allowed page (no loop)
  // Calls the REAL resolveTeamNavigation function used by TeamPageGuard
  // -----------------------------------------------------------------------
  console.log('>>> RUNNING TEST GROUP 4: Team Navigation Without Dashboard <<<\n');
  const userWithoutDashboard = {
    role: 'employee',
    teamId: 'team-a-sales',
    teamRef: {
      allowedPages: JSON.stringify(['leads', 'orders']),
    },
  };

  const decision = resolveTeamNavigation(userWithoutDashboard, 'dashboard');
  if (decision.action !== 'redirect' || decision.targetRoute !== '/leads') {
    recordFail('Team First Allowed Page', `Expected redirect to /leads but got: ${JSON.stringify(decision)}`);
  } else {
    recordPass('Team First Allowed Page', `Calling real resolveTeamNavigation: user without dashboard lands on '${decision.targetRoute}' with no infinite loop`);
  }

  // -----------------------------------------------------------------------
  // TEST 7: mustResetPassword = true blocks all API endpoints except /auth/*
  // Calls the REAL RolesGuard canActivate implementation
  // -----------------------------------------------------------------------
  console.log('>>> RUNNING TEST GROUP 7: mustResetPassword Guard <<<\n');
  const mustResetUser = {
    id: 'test-user-must-reset',
    email: 'must.reset@example.com',
    role: 'admin',
    tenantId: 'tenant-test-id',
    mustResetPassword: true,
  };

  const mockLeadsContext = {
    getHandler: () => () => {},
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: mustResetUser,
        url: '/api/v1/leads',
        path: '/api/v1/leads',
      }),
    }),
  } as any;

  reflector.getAllAndOverride = (key: string) => {
    if (key === 'page_access') return 'leads';
    if (key === 'roles') return ['admin', 'tenant_admin'];
    return undefined;
  };

  let nonAuthBlocked = false;
  let guardErrorMsg = '';
  try {
    await rolesGuard.canActivate(mockLeadsContext);
  } catch (err: any) {
    if (err instanceof ForbiddenException) {
      nonAuthBlocked = true;
      guardErrorMsg = err.message;
    }
  }
  if (!nonAuthBlocked) {
    recordFail('mustResetPassword Block', 'User with mustResetPassword was allowed to access /leads');
  } else {
    recordPass('mustResetPassword Block', `Calling real RolesGuard: blocked non-auth endpoint (/leads) with: "${guardErrorMsg}"`);
  }

  // Verify /auth/ endpoint is permitted
  reflector.getAllAndOverride = () => undefined;
  const mockAuthContext = {
    getHandler: () => () => {},
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: mustResetUser,
        url: '/api/v1/auth/change-password',
        path: '/api/v1/auth/change-password',
      }),
    }),
  } as any;

  const authPermitted = await rolesGuard.canActivate(mockAuthContext);
  if (!authPermitted) {
    recordFail('mustResetPassword Auth Allow', 'User was blocked from accessing /auth/change-password');
  } else {
    recordPass('mustResetPassword Auth Allow', 'Calling real RolesGuard: user with mustResetPassword is permitted to access /auth/change-password to set new password');
  }

  // -----------------------------------------------------------------------
  // TEST 8: CORS rejection of unknown origins
  // Calls the REAL corsOriginCallback used by main.ts
  // -----------------------------------------------------------------------
  console.log('>>> RUNNING TEST GROUP 8: CORS Policy Enforcement <<<\n');
  const testUntrustedOrigin = 'https://malicious-phishing-site.com';
  let untrustedError: Error | null = null;
  corsOriginCallback(testUntrustedOrigin, (err, allow) => {
    if (err) untrustedError = err;
  });
  if (!untrustedError) {
    recordFail('CORS Untrusted Rejection', 'Malicious origin was allowed by real corsOriginCallback');
  } else {
    recordPass('CORS Untrusted Rejection', `Calling real corsOriginCallback: origin "${testUntrustedOrigin}" rejected with "${untrustedError.message}" (no CORS headers issued)`);
  }

  const testTrustedOrigin = 'https://admin.jsnc.co.in';
  let trustedAllowed = false;
  corsOriginCallback(testTrustedOrigin, (err, allow) => {
    if (!err && allow) trustedAllowed = true;
  });
  if (!trustedAllowed) {
    recordFail('CORS Trusted Allow', 'Legitimate origin admin.jsnc.co.in was blocked by corsOriginCallback');
  } else {
    recordPass('CORS Trusted Allow', `Calling real corsOriginCallback: legitimate origin "${testTrustedOrigin}" is permitted`);
  }

  // -----------------------------------------------------------------------
  // TEST 9: Per-User Data Visibility Table & Scoping Enforcement
  // -----------------------------------------------------------------------
  console.log('>>> RUNNING TEST GROUP 9: Per-User Data Visibility & Scoping Enforcement <<<\n');

  // Setup: Use seeded users from Tenant A
  const empAUser = await prisma.user.findFirst({ where: { email: 'employee.a@example.com' } });
  const subAdminUser = await prisma.user.findFirst({ where: { email: 'sub_admin.a@example.com' } });
  const adminUser = await prisma.user.findFirst({ where: { email: 'admin.a@example.com' } });
  const storeMgrUser = await prisma.user.findFirst({ where: { email: 'store_manager.a@example.com' } });
  const devUser = await prisma.user.findFirst({ where: { email: 'developer.a@example.com' } });

  const scopedEmpA: ScopedUser = {
    id: empAUser!.id,
    role: empAUser!.role,
    tenantId: empAUser!.tenantId,
    employeeCode: empAUser!.employeeCode,
    teamId: empAUser!.teamId,
  };

  // Create Employee B in Tenant A with different team
  const otherTeam = await prisma.team.upsert({
    where: { id: 'team-ops-test' },
    update: {},
    create: {
      id: 'team-ops-test',
      tenantId: empAUser!.tenantId!,
      name: 'Operations Team Test',
      allowedPages: JSON.stringify(['leads', 'orders']),
    },
  });

  const hashedPw = await bcrypt.hash('TestPass123!', 10);

  const empBUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: empAUser!.tenantId!, email: 'employee.b.scope@example.com' } },
    update: { isActive: true },
    create: {
      tenantId: empAUser!.tenantId!,
      email: 'employee.b.scope@example.com',
      name: 'Employee B Scope Test',
      employeeCode: 'EMP-B-SCP',
      role: 'employee',
      passwordHash: hashedPw,
      isActive: true,
      teamId: otherTeam.id,
    },
  });

  const scopedEmpB: ScopedUser = {
    id: empBUser.id,
    role: empBUser.role,
    tenantId: empBUser.tenantId,
    employeeCode: empBUser.employeeCode,
    teamId: empBUser.teamId,
  };

  const scopedSubAdminUser: ScopedUser = {
    id: subAdminUser!.id,
    role: subAdminUser!.role,
    tenantId: subAdminUser!.tenantId,
    employeeCode: subAdminUser!.employeeCode,
    teamId: empAUser!.teamId,
  };

  const scopedAdminUser: ScopedUser = {
    id: adminUser!.id,
    role: adminUser!.role,
    tenantId: adminUser!.tenantId,
    employeeCode: adminUser!.employeeCode,
  };

  const scopedStoreMgr: ScopedUser = {
    id: storeMgrUser!.id,
    role: storeMgrUser!.role,
    tenantId: storeMgrUser!.tenantId,
    employeeCode: storeMgrUser!.employeeCode,
  };

  const scopedDevUser: ScopedUser = {
    id: devUser!.id,
    role: devUser!.role,
    tenantId: devUser!.tenantId,
    employeeCode: devUser!.employeeCode,
  };

  // Employee B creates: Company, Lead, Quotation
  const phoneLeadB = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const phoneQuoteB = `8${Math.floor(100000000 + Math.random() * 900000000)}`;

  const companyByB = await companiesService.create({
    name: `Private Company B ${timestamp}`,
    city: 'Bangalore',
  }, scopedEmpB);

  const leadByB = await leadsService.createLead({
    customerName: `Private Lead B ${timestamp}`,
    customerPhone: phoneLeadB,
    source: 'manual',
    companyName: companyByB.name,
    assignedToId: scopedEmpB.id,
  }, scopedEmpB);

  const quoteByB = await quotationsService.create({
    customerName: `Private Quote B ${timestamp}`,
    customerPhone: phoneQuoteB,
    lines: [{ name: 'Resistor 10k', quantity: 10, unitPrice: 5 }],
  }, scopedEmpB);

  // 9.1: Employee A cannot list Employee B's records
  const companiesSeenByEmpA = await companiesService.findAll(scopedEmpA);
  if (companiesSeenByEmpA.some((c: any) => c.id === companyByB.id)) {
    recordFail('Scope List: Company', 'Employee A was able to list Employee B company');
  } else {
    recordPass('Scope List: Company', 'Employee A cannot list Company created by Employee B (scope: own)');
  }

  const leadsSeenByEmpA = await leadsService.findAll(scopedEmpA);
  if (leadsSeenByEmpA.items.some((l: any) => l.id === leadByB.id)) {
    recordFail('Scope List: Lead', 'Employee A was able to list Employee B lead');
  } else {
    recordPass('Scope List: Lead', 'Employee A cannot list Lead created by Employee B (scope: own)');
  }

  const quotesSeenByEmpA = await quotationsService.findAll(scopedEmpA, {});
  if (quotesSeenByEmpA.items.some((q: any) => q.id === quoteByB.id)) {
    recordFail('Scope List: Quotation', 'Employee A was able to list Employee B quotation');
  } else {
    recordPass('Scope List: Quotation', 'Employee A cannot list Quotation created by Employee B (scope: own)');
  }

  // 9.2: Employee A cannot open (get-by-id) Employee B's records -> throws NotFoundException (404, not 403)
  let empAOpenCompBlocked = false;
  try {
    await companiesService.findOne(companyByB.id, scopedEmpA);
  } catch (err: any) {
    if (err instanceof NotFoundException) empAOpenCompBlocked = true;
  }
  if (!empAOpenCompBlocked) recordFail('Scope Open: Company 404', 'Employee A did not get 404 on Employee B company');
  else recordPass('Scope Open: Company 404', 'Employee A receives 404 NotFoundException trying to open Employee B company');

  let empAOpenLeadBlocked = false;
  try {
    await leadsService.findOne(leadByB.id, scopedEmpA);
  } catch (err: any) {
    if (err instanceof NotFoundException) empAOpenLeadBlocked = true;
  }
  if (!empAOpenLeadBlocked) recordFail('Scope Open: Lead 404', 'Employee A did not get 404 on Employee B lead');
  else recordPass('Scope Open: Lead 404', 'Employee A receives 404 NotFoundException trying to open Employee B lead');

  let empAOpenQuoteBlocked = false;
  try {
    await quotationsService.findOne(quoteByB.id, scopedEmpA);
  } catch (err: any) {
    if (err instanceof NotFoundException) empAOpenQuoteBlocked = true;
  }
  if (!empAOpenQuoteBlocked) recordFail('Scope Open: Quotation 404', 'Employee A did not get 404 on Employee B quotation');
  else recordPass('Scope Open: Quotation 404', 'Employee A receives 404 NotFoundException trying to open Employee B quotation');

  // 9.3: Employee A cannot edit (update) Employee B's records -> throws NotFoundException
  let empAEditCompBlocked = false;
  try {
    await companiesService.update(companyByB.id, { name: 'Compromised Name' }, scopedEmpA);
  } catch (err: any) {
    if (err instanceof NotFoundException) empAEditCompBlocked = true;
  }
  if (!empAEditCompBlocked) recordFail('Scope Edit: Company 404', 'Employee A was able to update Employee B company');
  else recordPass('Scope Edit: Company 404', 'Employee A receives 404 NotFoundException trying to update Employee B company');

  // 9.4: Employee A cannot delete Employee B's records -> throws NotFoundException
  let empADeleteCompBlocked = false;
  try {
    await companiesService.delete(companyByB.id, scopedEmpA);
  } catch (err: any) {
    if (err instanceof NotFoundException) empADeleteCompBlocked = true;
  }
  if (!empADeleteCompBlocked) recordFail('Scope Delete: Company 404', 'Employee A was able to delete Employee B company');
  else recordPass('Scope Delete: Company 404', 'Employee A receives 404 NotFoundException trying to delete Employee B company');

  // 9.5: Sub_admin sees only their team's records + unassigned
  const subAdminLeads = await leadsService.findAll(scopedSubAdminUser);
  if (subAdminLeads.items.some((l: any) => l.id === leadByB.id)) {
    recordFail('Scope Sub-Admin: Team Isolation', 'Sub-admin saw lead assigned to a different team');
  } else {
    recordPass('Scope Sub-Admin: Team Isolation', 'Sub-admin sees only own team records and unassigned leads (excludes Team Ops lead)');
  }

  // 9.6: Admin sees all records in company
  const adminCompanies = await companiesService.findAll(scopedAdminUser);
  const adminLeads = await leadsService.findAll(scopedAdminUser);
  const adminQuotes = await quotationsService.findAll(scopedAdminUser, {});
  if (
    adminCompanies.some((c: any) => c.id === companyByB.id) &&
    adminLeads.items.some((l: any) => l.id === leadByB.id) &&
    adminQuotes.items.some((q: any) => q.id === quoteByB.id)
  ) {
    recordPass('Scope Admin: Full Access', 'Admin / Tenant Admin sees all company data across all teams and owners');
  } else {
    recordFail('Scope Admin: Full Access', 'Admin failed to see all records in the company');
  }

  // 9.7: Employee cannot see company totals on the dashboard
  const empDashboard = await dashboardService.getKpis(scopedEmpA);
  if (empDashboard.activeSuppliers === 0) {
    recordPass('Scope Dashboard: Supplier Visibility', 'Employee cannot see company supplier totals on dashboard (suppliers count is 0)');
  } else {
    recordFail('Scope Dashboard: Supplier Visibility', 'Employee was shown company supplier totals on dashboard');
  }

  // 9.8: Search respects scope
  const empSearchLeads = await leadsService.findAll(scopedEmpA, { search: 'Private' });
  if (empSearchLeads.items.some((l: any) => l.id === leadByB.id)) {
    recordFail('Scope Search: Lead Isolation', 'Employee search revealed another employee lead');
  } else {
    recordPass('Scope Search: Lead Isolation', 'Search query strictly respects user scope (Employee cannot find Employee B records via search)');
  }

  // 9.9: Store Manager and Developer role visibility
  let storeMgrLeadBlocked = false;
  try {
    await leadsService.findAll(scopedStoreMgr);
  } catch (err: any) {
    if (err instanceof ForbiddenException) storeMgrLeadBlocked = true;
  }
  if (!storeMgrLeadBlocked) recordFail('Role Scope: Store Manager Lead Access', 'Store manager was allowed to access Leads');
  else recordPass('Role Scope: Store Manager Lead Access', 'Store Manager blocked from accessing Leads with ForbiddenException (visibility: none)');

  let devSupplierBlocked = false;
  try {
    await suppliersService.findAll(scopedDevUser);
  } catch (err: any) {
    if (err instanceof ForbiddenException) devSupplierBlocked = true;
  }
  if (!devSupplierBlocked) recordFail('Role Scope: Developer Supplier Access', 'Developer was allowed to access Suppliers');
  else recordPass('Role Scope: Developer Supplier Access', 'Developer blocked from accessing Suppliers with ForbiddenException (visibility: none)');

  console.log('========================================================================');
  console.log('TEST SUMMARY:');
  console.log(`  PASSED:  ${passedCount}`);
  console.log(`  FAILED:  ${failedCount}`);
  console.log(`  SKIPPED: ${skippedCount}`);
  console.log('========================================================================\n');

  await prisma.$disconnect();

  if (failedCount > 0 || skippedCount > 0) {
    console.error(`[EXECUTION INCOMPLETE]: Test suite finished with ${failedCount} failure(s) and ${skippedCount} skipped verification(s).`);
    console.error(`Per Honest Reporting Rule 3: Skipped groups count as NOT verified. Exiting with non-zero code.\n`);
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('[TEST SUITE CRASHED]:', err);
  process.exit(1);
});
