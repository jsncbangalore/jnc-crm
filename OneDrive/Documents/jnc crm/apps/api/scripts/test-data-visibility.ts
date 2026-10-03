/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { ScopingService, ScopedUser } from '../src/auth/scoping.service';
import { VISIBILITY_TABLE, getVisibility, ModelName, RoleName } from '../src/auth/data-visibility';
import { ForbiddenException } from '@nestjs/common';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
  }
}

function runVisibilityTests() {
  console.log('========================================================================');
  console.log('DATA VISIBILITY & SCOPING TABLE TEST SUITE');
  console.log('========================================================================\n');

  const scoping = new ScopingService();

  // Test users
  const admin: ScopedUser = {
    id: 'user-admin',
    employeeCode: 'ADM-001',
    role: 'admin',
    tenantId: 'tenant-1',
  };

  const tenantAdmin: ScopedUser = {
    id: 'user-tadmin',
    employeeCode: 'TAD-001',
    role: 'tenant_admin',
    tenantId: 'tenant-1',
  };

  const subAdmin: ScopedUser = {
    id: 'user-subadmin',
    employeeCode: 'SUB-001',
    role: 'sub_admin',
    teamId: 'team-sales',
    tenantId: 'tenant-1',
  };

  const empA: ScopedUser = {
    id: 'user-emp-a',
    employeeCode: 'EMP-001',
    role: 'employee',
    teamId: 'team-sales',
    tenantId: 'tenant-1',
  };

  const empB: ScopedUser = {
    id: 'user-emp-b',
    employeeCode: 'EMP-002',
    role: 'employee',
    teamId: 'team-sales',
    tenantId: 'tenant-1',
  };

  const storeMgr: ScopedUser = {
    id: 'user-store-mgr',
    employeeCode: 'STR-001',
    role: 'store_manager',
    tenantId: 'tenant-1',
  };

  const dev: ScopedUser = {
    id: 'user-dev',
    employeeCode: 'DEV-001',
    role: 'developer',
    tenantId: 'tenant-1',
  };

  // ─── 1. Table values verification ──────────────────────────────────────────
  console.log('--- 1. VISIBILITY TABLE STRUCTURE ---');

  assert(
    getVisibility('tenant_admin', 'Lead') === 'all' &&
    getVisibility('admin', 'Order') === 'all' &&
    getVisibility('admin', 'Supplier') === 'all',
    'tenant_admin & admin have "all" on all models',
  );

  assert(
    getVisibility('sub_admin', 'Lead') === 'team' &&
    getVisibility('sub_admin', 'Company') === 'team' &&
    getVisibility('sub_admin', 'Contact') === 'team' &&
    getVisibility('sub_admin', 'Quotation') === 'team' &&
    getVisibility('sub_admin', 'Order') === 'team' &&
    getVisibility('sub_admin', 'Invoice') === 'team' &&
    getVisibility('sub_admin', 'Supplier') === 'all' &&
    getVisibility('sub_admin', 'Inventory') === 'all',
    'sub_admin has "team" on CRM models and "all" on Supplier/Inventory',
  );

  assert(
    getVisibility('employee', 'Lead') === 'own' &&
    getVisibility('employee', 'Company') === 'own' &&
    getVisibility('employee', 'Contact') === 'own' &&
    getVisibility('employee', 'Quotation') === 'own' &&
    getVisibility('employee', 'Order') === 'own' &&
    getVisibility('employee', 'Invoice') === 'own' &&
    getVisibility('employee', 'Supplier') === 'none' &&
    getVisibility('employee', 'Inventory') === 'all',
    'employee has "own" on CRM models, "none" on Supplier, "all" on Inventory',
  );

  assert(
    getVisibility('store_manager', 'Inventory') === 'all' &&
    getVisibility('store_manager', 'Supplier') === 'all' &&
    getVisibility('store_manager', 'Lead') === 'none',
    'store_manager has "all" on Inventory/Supplier and "none" on Lead',
  );

  assert(
    getVisibility('developer', 'Activity') === 'own' &&
    getVisibility('developer', 'Lead') === 'none' &&
    getVisibility('developer', 'Supplier') === 'none',
    'developer has "own" on Activity and "none" on Lead/Supplier',
  );

  // ─── 2. ScopingService query shape tests ──────────────────────────────────
  console.log('\n--- 2. SCOPING SERVICE PRISMA QUERY GENERATION ---');

  // Admin scope on Lead -> returns only tenantId filter
  const adminLeadScope = scoping.getLeadScope(admin);
  assert(
    adminLeadScope.tenantId === 'tenant-1' && !adminLeadScope.OR,
    'Admin lead scope has tenantId and no OR clause (sees all)',
  );

  // Sub-admin scope on Lead -> filters by team
  const subAdminLeadScope = scoping.getLeadScope(subAdmin);
  assert(
    subAdminLeadScope.tenantId === 'tenant-1' &&
    Array.isArray(subAdminLeadScope.OR) &&
    subAdminLeadScope.OR.some((c: any) => c.assignedTo?.teamId === 'team-sales'),
    'Sub-admin lead scope includes teamId in OR clause',
  );

  // Employee A scope on Lead -> filters by own
  const empALeadScope = scoping.getLeadScope(empA);
  assert(
    empALeadScope.tenantId === 'tenant-1' &&
    Array.isArray(empALeadScope.OR) &&
    empALeadScope.OR.some((c: any) => c.assignedToId === 'user-emp-a') &&
    empALeadScope.OR.some((c: any) => c.createdById === 'user-emp-a') &&
    empALeadScope.OR.some((c: any) => c.shares !== undefined),
    'Employee A lead scope filters by own assignedToId, createdById, or shares',
  );

  // Employee A scope does NOT include Employee B's id
  const empAClausesJson = JSON.stringify(empALeadScope);
  assert(
    !empAClausesJson.includes('user-emp-b'),
    'Employee A scope does NOT mention Employee B',
  );

  // Employee scope on Company -> 'own'
  const empACompanyScope = scoping.getCompanyScope(empA);
  assert(
    empACompanyScope.tenantId === 'tenant-1' &&
    Array.isArray(empACompanyScope.OR) &&
    empACompanyScope.OR.some((c: any) => c.createdById === 'user-emp-a'),
    'Employee A company scope filters by createdById = user-emp-a',
  );

  // Employee scope on Supplier -> throws ForbiddenException
  let empSupplierBlocked = false;
  try {
    scoping.getSupplierScope(empA);
  } catch (e: any) {
    if (e instanceof ForbiddenException) empSupplierBlocked = true;
  }
  assert(empSupplierBlocked, 'Employee cannot access Supplier (throws ForbiddenException)');

  // Store manager scope on Lead -> throws ForbiddenException
  let storeMgrLeadBlocked = false;
  try {
    scoping.getLeadScope(storeMgr);
  } catch (e: any) {
    if (e instanceof ForbiddenException) storeMgrLeadBlocked = true;
  }
  assert(storeMgrLeadBlocked, 'Store manager cannot access Lead (throws ForbiddenException)');

  // Store manager scope on Supplier -> returns all in tenant
  const storeMgrSupplierScope = scoping.getSupplierScope(storeMgr);
  assert(
    storeMgrSupplierScope.tenantId === 'tenant-1' && !storeMgrSupplierScope.OR,
    'Store manager has full tenant access to Supplier',
  );

  // Developer scope on Lead -> throws ForbiddenException
  let devLeadBlocked = false;
  try {
    scoping.getLeadScope(dev);
  } catch (e: any) {
    if (e instanceof ForbiddenException) devLeadBlocked = true;
  }
  assert(devLeadBlocked, 'Developer cannot access Lead (throws ForbiddenException)');

  // ─── 3. Isolation between Employee A and Employee B ───────────────────────
  console.log('\n--- 3. DATA ISOLATION BETWEEN EMPLOYEES ---');

  // Verify that an object created by Emp B will NOT match Emp A's scope
  const recordCreatedByB = { createdById: 'user-emp-b', tenantId: 'tenant-1' };
  const empAScope = scoping.getScope(empA, 'Company');

  // Manual evaluation of Prisma where match:
  const matchesTenant = recordCreatedByB.tenantId === empAScope.tenantId;
  const matchesEmpAOwn = empAScope.OR.some(
    (clause: any) => clause.createdById === recordCreatedByB.createdById,
  );
  assert(
    matchesTenant && !matchesEmpAOwn,
    'Record created by Employee B does NOT match Employee A\'s Company scope',
  );

  // Quotation scope isolation
  const empAQuoteScope = scoping.getQuotationScope(empA);
  const quoteCreatedByB = { createdById: 'user-emp-b' };
  const matchesQuote = empAQuoteScope.OR.some(
    (clause: any) => clause.createdById === quoteCreatedByB.createdById,
  );
  assert(
    !matchesQuote,
    'Quotation created by Employee B does NOT match Employee A\'s Quotation scope',
  );

  // Order scope isolation
  const empAOrderScope = scoping.getOrderScope(empA);
  const orderCreatedByB = { createdById: 'user-emp-b' };
  const matchesOrder = empAOrderScope.OR.some(
    (clause: any) => clause.createdById === orderCreatedByB.createdById,
  );
  assert(
    !matchesOrder,
    'Order created by Employee B does NOT match Employee A\'s Order scope',
  );

  // Invoice scope isolation
  const empAInvoiceScope = scoping.getInvoiceScope(empA);
  const invoiceCreatedByB = { createdById: 'user-emp-b' };
  const matchesInvoice = empAInvoiceScope.OR.some(
    (clause: any) => clause.createdById === invoiceCreatedByB.createdById,
  );
  assert(
    !matchesInvoice,
    'Invoice created by Employee B does NOT match Employee A\'s Invoice scope',
  );

  // ─── 4. Sub-admin team scoping ────────────────────────────────────────────
  console.log('\n--- 4. SUB-ADMIN TEAM SCOPING ---');

  const subAdminCompanyScope = scoping.getCompanyScope(subAdmin);
  assert(
    subAdminCompanyScope.tenantId === 'tenant-1' &&
    Array.isArray(subAdminCompanyScope.OR) &&
    subAdminCompanyScope.OR.some((c: any) => c.createdById === 'user-subadmin'),
    'Sub-admin Company scope includes createdById = user-subadmin',
  );

  // ─── Final Summary ─────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED, 0 SKIPPED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVisibilityTests();
