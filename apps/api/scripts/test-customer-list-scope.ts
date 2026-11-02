/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import { ScopingService, ScopedUser } from '../src/auth/scoping.service';
import {
  getVisibility,
  getVisibilityTable,
  VISIBILITY_TABLE_OWN,
  VISIBILITY_TABLE_COMPANY,
  CustomerListScope,
} from '../src/auth/data-visibility';

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

async function runCustomerListScopeTestSuite() {
  console.log('========================================================================');
  console.log('CUSTOMER_LIST_SCOPE UNIT & INTEGRATION TEST SUITE');
  console.log('========================================================================\n');

  // ────────────────────────────────────────────────────────────────────────────
  // PART 1: SCOPING LOGIC & TABLE VERIFICATION (OWN vs COMPANY)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('--- 1. VISIBILITY TABLE STRUCTURE CHECK ---');

  // Check OWN table defaults
  assert(
    VISIBILITY_TABLE_OWN.employee.Company === 'own' &&
    VISIBILITY_TABLE_OWN.employee.Contact === 'own' &&
    VISIBILITY_TABLE_OWN.employee.Lead === 'own' &&
    VISIBILITY_TABLE_OWN.employee.Quotation === 'own',
    'VISIBILITY_TABLE_OWN has employee Company=own, Contact=own, Lead=own, Quotation=own',
  );

  // Check COMPANY table overrides
  assert(
    VISIBILITY_TABLE_COMPANY.employee.Company === 'all' &&
    VISIBILITY_TABLE_COMPANY.employee.Contact === 'all' &&
    VISIBILITY_TABLE_COMPANY.employee.Lead === 'own' &&
    VISIBILITY_TABLE_COMPANY.employee.Quotation === 'own',
    'VISIBILITY_TABLE_COMPANY has employee Company=all, Contact=all, Lead=own, Quotation=own',
  );

  // Check other roles are identical across tables
  assert(
    VISIBILITY_TABLE_OWN.tenant_admin.Company === VISIBILITY_TABLE_COMPANY.tenant_admin.Company &&
    VISIBILITY_TABLE_OWN.admin.Company === VISIBILITY_TABLE_COMPANY.admin.Company &&
    VISIBILITY_TABLE_OWN.sub_admin.Company === VISIBILITY_TABLE_COMPANY.sub_admin.Company &&
    VISIBILITY_TABLE_OWN.store_manager.Company === VISIBILITY_TABLE_COMPANY.store_manager.Company,
    'Other roles (tenant_admin, admin, sub_admin, store_manager) remain consistent in both tables',
  );

  console.log('\n--- 2. SCOPING SERVICE BEHAVIOR ---');
  const scoping = new ScopingService();

  const emp1: ScopedUser = {
    id: 'emp-user-1',
    employeeCode: 'EMP-001',
    role: 'employee',
    tenantId: 'tenant-alpha',
  };

  const emp2: ScopedUser = {
    id: 'emp-user-2',
    employeeCode: 'EMP-002',
    role: 'employee',
    tenantId: 'tenant-alpha',
  };

  // Test with overrideScope = 'own'
  const scopeOwn = scoping.getCompanyScope(emp1, 'own');
  assert(
    scopeOwn.tenantId === 'tenant-alpha' &&
    Array.isArray(scopeOwn.OR) &&
    scopeOwn.OR.some((c: any) => c.createdById === 'emp-user-1'),
    "Under 'own': getCompanyScope filters by tenantId AND createdById",
    JSON.stringify(scopeOwn),
  );

  // Test with overrideScope = 'company'
  const scopeCompany = scoping.getCompanyScope(emp1, 'company');
  assert(
    scopeCompany.tenantId === 'tenant-alpha' &&
    scopeCompany.OR === undefined,
    "Under 'company': getCompanyScope filters ONLY by tenantId (tenant-wide access)",
    JSON.stringify(scopeCompany),
  );

  // Test that Lead remains 'own' under both modes
  process.env.CUSTOMER_LIST_SCOPE = 'company';
  const leadScopeUnderCompany = scoping.getLeadScope(emp1);
  assert(
    leadScopeUnderCompany.tenantId === 'tenant-alpha' &&
    Array.isArray(leadScopeUnderCompany.OR) &&
    leadScopeUnderCompany.OR.some((c: any) => c.createdById === 'emp-user-1'),
    "Under CUSTOMER_LIST_SCOPE='company': getLeadScope strictly stays 'own'",
    JSON.stringify(leadScopeUnderCompany),
  );

  // Test that Contact becomes 'all' under 'company' mode
  const contactScopeUnderCompany = scoping.getContactScope(emp1, 'company');
  assert(
    contactScopeUnderCompany.tenantId === 'tenant-alpha' &&
    contactScopeUnderCompany.OR === undefined,
    "Under CUSTOMER_LIST_SCOPE='company': getContactScope is tenant-wide ('all')",
    JSON.stringify(contactScopeUnderCompany),
  );

  // ────────────────────────────────────────────────────────────────────────────
  // PART 2: DATABASE & QUERY INTEGRATION TEST
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. DATABASE MULTI-TENANT & SCOPING INTEGRATION TEST ---');
  const prisma = new PrismaClient();

  try {
    // Setup test tenants and users
    const testTenantA = await prisma.tenant.upsert({
      where: { code: 'TEST-TENANT-SCOPE-A' },
      update: {},
      create: {
        id: 'test-scope-tenant-a-id',
        code: 'TEST-TENANT-SCOPE-A',
        name: 'Scope Test Org Alpha',
        slug: 'scope-test-alpha',
        status: 'active',
      },
    });

    const testTenantB = await prisma.tenant.upsert({
      where: { code: 'TEST-TENANT-SCOPE-B' },
      update: {},
      create: {
        id: 'test-scope-tenant-b-id',
        code: 'TEST-TENANT-SCOPE-B',
        name: 'Scope Test Org Beta',
        slug: 'scope-test-beta',
        status: 'active',
      },
    });

    const userEmpA1 = await prisma.user.upsert({
      where: { id: 'test-scope-emp-a1' },
      update: { tenantId: testTenantA.id },
      create: {
        id: 'test-scope-emp-a1',
        email: 'emp-a1@example.com',
        passwordHash: '$2b$10$maskedhashforautomatedtestpurposes',
        name: 'Employee A1 (Creator)',
        employeeCode: 'EMPA-001',
        role: 'employee',
        tenantId: testTenantA.id,
      },
    });

    const userEmpA2 = await prisma.user.upsert({
      where: { id: 'test-scope-emp-a2' },
      update: { tenantId: testTenantA.id },
      create: {
        id: 'test-scope-emp-a2',
        email: 'emp-a2@example.com',
        passwordHash: '$2b$10$maskedhashforautomatedtestpurposes',
        name: 'Employee A2 (Colleague)',
        employeeCode: 'EMPA-002',
        role: 'employee',
        tenantId: testTenantA.id,
      },
    });

    const userEmpB1 = await prisma.user.upsert({
      where: { id: 'test-scope-emp-b1' },
      update: { tenantId: testTenantB.id },
      create: {
        id: 'test-scope-emp-b1',
        email: 'emp-b1@example.com',
        passwordHash: '$2b$10$maskedhashforautomatedtestpurposes',
        name: 'Employee B1 (Cross-Tenant)',
        employeeCode: 'EMPB-001',
        role: 'employee',
        tenantId: testTenantB.id,
      },
    });

    // Cleanup any prior test companies
    await prisma.company.deleteMany({
      where: { name: { startsWith: 'Scope Test Company' } },
    });

    // Employee A1 creates a Company in Tenant A
    const companyCreatedByA1 = await prisma.company.create({
      data: {
        id: 'test-comp-created-by-a1',
        name: 'Scope Test Company Alpha Inc',
        tenantId: testTenantA.id,
        createdById: userEmpA1.id,
      },
    });

    assert(
      companyCreatedByA1.createdById === userEmpA1.id &&
      companyCreatedByA1.tenantId === testTenantA.id,
      'Employee A1 successfully created company with ownership',
      `ID=${companyCreatedByA1.id}, createdById=${companyCreatedByA1.createdById}`,
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: Mode = 'own'
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n>>> Testing Scenario: CUSTOMER_LIST_SCOPE = 'own' <<<");
    process.env.CUSTOMER_LIST_SCOPE = 'own';

    // Colleague EmpA2 in same Tenant A lists companies under 'own'
    const whereEmpA2Own = {
      ...scoping.getCompanyScope(userEmpA2, 'own'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countA2Own = await prisma.company.count({ where: whereEmpA2Own });
    assert(
      countA2Own === 0,
      "Employee A2 (same tenant) sees 0 companies under 'own'",
      `Count: ${countA2Own}`,
    );

    // Creator EmpA1 in same Tenant A lists companies under 'own'
    const whereEmpA1Own = {
      ...scoping.getCompanyScope(userEmpA1, 'own'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countA1Own = await prisma.company.count({ where: whereEmpA1Own });
    assert(
      countA1Own === 1,
      "Employee A1 (creator) sees 1 company under 'own'",
      `Count: ${countA1Own}`,
    );

    // Cross-tenant EmpB1 in Tenant B lists companies under 'own'
    const whereEmpB1Own = {
      ...scoping.getCompanyScope(userEmpB1, 'own'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countB1Own = await prisma.company.count({ where: whereEmpB1Own });
    assert(
      countB1Own === 0,
      "Employee B1 (cross-tenant) sees 0 companies under 'own'",
      `Count: ${countB1Own}`,
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: Mode = 'company'
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n>>> Testing Scenario: CUSTOMER_LIST_SCOPE = 'company' <<<");
    process.env.CUSTOMER_LIST_SCOPE = 'company';

    // Colleague EmpA2 in same Tenant A lists companies under 'company'
    const whereEmpA2Company = {
      ...scoping.getCompanyScope(userEmpA2, 'company'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countA2Company = await prisma.company.count({ where: whereEmpA2Company });
    assert(
      countA2Company === 1,
      "Employee A2 (same tenant) sees 1 company under 'company'",
      `Count: ${countA2Company}`,
    );

    // Creator EmpA1 in same Tenant A lists companies under 'company'
    const whereEmpA1Company = {
      ...scoping.getCompanyScope(userEmpA1, 'company'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countA1Company = await prisma.company.count({ where: whereEmpA1Company });
    assert(
      countA1Company === 1,
      "Employee A1 (creator) sees 1 company under 'company'",
      `Count: ${countA1Company}`,
    );

    // Cross-tenant EmpB1 in Tenant B lists companies under 'company'
    const whereEmpB1Company = {
      ...scoping.getCompanyScope(userEmpB1, 'company'),
      id: companyCreatedByA1.id,
      deletedAt: null,
    };
    const countB1Company = await prisma.company.count({ where: whereEmpB1Company });
    assert(
      countB1Company === 0,
      "Employee B1 (cross-tenant) sees 0 companies under 'company'",
      `Count: ${countB1Company}`,
    );

    // Clean up created test company
    await prisma.company.deleteMany({
      where: { id: companyCreatedByA1.id },
    });

  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`CUSTOMER_LIST_SCOPE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCustomerListScopeTestSuite().catch((err) => {
  console.error('[FATAL] Unhandled error during customer list scope test:', err);
  process.exit(1);
});
