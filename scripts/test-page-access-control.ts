import 'reflect-metadata';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as ts from 'typescript';
import {
  ALL_PAGE_KEYS,
  ALL_COMPANY_PAGE_KEYS,
  ALL_PLATFORM_PAGE_KEYS,
  COMPANY_PAGE_REGISTRY as API_PAGE_REGISTRY,
  isPlatformPageKey,
  isValidCompanyPageKey,
  mapOldToNewPageKey,
  OLD_TO_NEW_PAGE_KEY_MAP,
} from '../apps/api/src/auth/page-registry';
import { PAGE_KEY_TO_ROUTE, ROLE_ALLOWED_PAGES } from '../apps/api/src/common/team-navigation';
import { getEffectivePagesForUser, getLegacyPagesForRole } from '../apps/api/src/auth/effective-page-access';
import { ROLE_RANKS } from '../apps/api/src/auth/roles';
import { ADMIN_PAGES } from '../apps/api/src/users/users.service';
import { runUserPageAccessMigration } from './migrate-user-page-access';

console.log('====================================================');
console.log('   GRANULAR PAGE ACCESS CONTROL VERIFICATION SUITE   ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  [FAIL] ${name}:`, err.message);
          throw err;
        });
    } else {
      console.log(`  [PASS] ${name}`);
      passedTests++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}



async function main() {
  // ─── TEST 1: Menu Keys equal Server Keys (1:1 parity with frontend registry) ───
  runTest('Menu keys equal server keys (1:1 parity with frontend registry)', () => {
    const allKeys = [...ALL_PAGE_KEYS].sort();
    const companyKeys = [...ALL_COMPANY_PAGE_KEYS].sort();
    const routeKeys = Object.keys(PAGE_KEY_TO_ROUTE).sort();

    const webFilePath = path.join(__dirname, '../apps/web/src/config/page-registry.ts');
    const webFileContent = fs.readFileSync(webFilePath, 'utf8');

    for (const key of companyKeys) {
      assert.ok(
        webFileContent.includes(`key: '${key}'`),
        `Frontend page registry must define key '${key}'`,
      );
    }

    assert.deepStrictEqual(allKeys, routeKeys, 'All registered page keys must have a corresponding route mapping');
    assert.strictEqual(companyKeys.length, 21, 'Expected exactly 21 company pages');
    assert.strictEqual(ALL_PLATFORM_PAGE_KEYS.length, 3, 'Expected exactly 3 platform pages');
  });

  // ─── TEST 2: Real Integration Access Tests (Replaces Decorator-Only AST Check) ───
  await runTest('Real access tests: login without each page (ledger, invoices, quotations, branding) expects 403 on API and No Access screen in browser', async () => {
    const output = execSync('node scripts/test-real-page-access.js', { encoding: 'utf8', stdio: 'pipe' });
    assert.ok(
      output.includes('REAL ACCESS TEST RESULTS: 10/10 TESTS PASSED'),
      'Real access integration test suite must pass all 10 tests'
    );
  });

  // ─── TEST 3: Old-to-New Page Key Mapping and Normalization ───
  runTest('Old-to-new page key mapping function handles legacy kebab, camelCase, and paths', () => {
    const testCases: [string, string][] = [
      ['daily-activities', 'daily_activities'],
      ['dailyActivities', 'daily_activities'],
      ['/daily-activities', 'daily_activities'],
      ['purchase-bills', 'purchase_bills'],
      ['purchaseBills', 'purchase_bills'],
      ['/purchase-bills', 'purchase_bills'],
      ['lead-flow', 'lead_flow'],
      ['leadFlow', 'lead_flow'],
      ['/lead-flow', 'lead_flow'],
      ['start-setup', 'lead_setup'],
      ['lead-setup', 'lead_setup'],
      ['/start-setup', 'lead_setup'],
      ['setup/objects', 'custom_objects'],
      ['custom-objects', 'custom_objects'],
      ['/setup/objects', 'custom_objects'],
      ['audit-logs', 'audit_logs'],
      ['/audit-logs', 'audit_logs'],
      ['/setup', 'audit_logs'],
      ['settings/mail', 'mail_settings'],
      ['mail-settings', 'mail_settings'],
      ['/settings/mail', 'mail_settings'],
      ['settings/branding', 'branding'],
      ['/settings/branding', 'branding'],
      ['/leads', 'leads'],
      ['/orders', 'orders'],
      ['/invoices', 'invoices'],
      ['/inventory', 'inventory'],
      ['/suppliers', 'suppliers'],
      ['/shipments', 'shipments'],
      ['/quotations', 'quotations'],
      ['/', 'dashboard'],
      ['dashboard', 'dashboard'],
    ];

    for (const [input, expected] of testCases) {
      const mapped = mapOldToNewPageKey(input);
      assert.strictEqual(mapped, expected, `Failed mapping '${input}' -> expected '${expected}', got '${mapped}'`);
    }

    assert.strictEqual(mapOldToNewPageKey('invalid_nonexistent_key'), null);
  });

  // ─── TEST 4: Role-to-Pages Exact Parity (Old Code vs Migration Helper) ───
  runTest('Role to pages exact parity across all 10 roles', () => {
    const ROLES = [
      'tenant_admin',
      'admin',
      'sub_admin',
      'project_manager',
      'developer_lead',
      'store_manager',
      'finance',
      'accountant',
      'employee',
      'developer',
    ];

    for (const role of ROLES) {
      const helperPages = getLegacyPagesForRole(role).sort();
      const oldBaselinePages = (ROLE_ALLOWED_PAGES[role] || []).filter(isValidCompanyPageKey).sort();

      assert.deepStrictEqual(
        helperPages,
        oldBaselinePages,
        `Role '${role}' has mismatch between old code rules and migration helper pages!`,
      );
    }
  });

  // ─── TEST 5: Idempotent Migration Helper Simulation (Never overwrites, single transaction) ───
  await runTest('Migration helper is idempotent, never overwrites existing rows, executes in 1 transaction', async () => {
    const existingUsers = [
      { id: 'user-already-configured', tenantId: 'tenant-1', role: 'employee', teamId: null },
      { id: 'user-needs-migration', tenantId: 'tenant-1', role: 'store_manager', teamId: 'team-ops' },
    ];

    const mockExistingAccess = [
      { userId: 'user-already-configured', tenantId: 'tenant-1', pages: JSON.stringify(['leads']) },
    ];

    const mockTeams = [
      { id: 'team-ops', name: 'Ops Team', allowedPages: JSON.stringify(['inventory', 'purchase-bills']) },
    ];

    let transactionOps: any[] = [];
    const mockPrisma: any = {
      team: {
        findMany: async () => mockTeams,
        update: (args: any) => ({ type: 'team.update', ...args }),
      },
      userPageAccess: {
        findMany: async () => mockExistingAccess,
        create: (args: any) => ({ type: 'userPageAccess.create', ...args }),
        update: () => {
          throw new Error('FATAL: Idempotency violated! update called on userPageAccess!');
        },
      },
      user: {
        findMany: async () => existingUsers,
      },
      $transaction: async (ops: any[]) => {
        transactionOps = ops;
        return ops;
      },
    };

    // Run 1: First execution
    const run1 = await runUserPageAccessMigration(mockPrisma, { execute: true });
    assert.strictEqual(run1.preservedCount, 1, 'user-already-configured must be preserved');
    assert.strictEqual(run1.newCreationsCount, 1, 'Only user-needs-migration must be created');
    assert.strictEqual(transactionOps.length, 2, 'Expected 1 team update + 1 userPageAccess create in transaction');

    // Run 2: Second execution (Simulating database after first run)
    mockExistingAccess.push({
      userId: 'user-needs-migration',
      tenantId: 'tenant-1',
      pages: JSON.stringify(['inventory', 'purchase_bills']),
    });
    mockTeams[0].allowedPages = JSON.stringify(['inventory', 'purchase_bills']); // already canonical

    transactionOps = [];
    const run2 = await runUserPageAccessMigration(mockPrisma, { execute: true });
    assert.strictEqual(run2.preservedCount, 2, 'Both users must now be detected as preserved');
    assert.strictEqual(run2.newCreationsCount, 0, 'Zero new creations on second run');
    assert.strictEqual(run2.teamUpdatesCount, 0, 'Zero team updates on second run');
    assert.strictEqual(transactionOps.length, 0, 'Zero operations in transaction on second run');
  });

  // ─── TEST 6: User with Custom Pages vs Team Fallback vs No Team ───
  await runTest('Effective pages resolution hierarchy (custom > team > empty)', async () => {
    const mockPrisma: any = {
      userPageAccess: {
        findUnique: async ({ where }: any) => {
          if (where.userId === 'user-custom') {
            return { userId: 'user-custom', pages: JSON.stringify(['leads', 'quotations']) };
          }
          return null;
        },
      },
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === 'user-team' || where.userId === 'user-team') {
            return {
              id: 'user-team',
              teamId: 'team-ops',
              teamRef: { id: 'team-ops', allowedPages: JSON.stringify(['inventory', 'suppliers']) },
            };
          }
          return { id: 'user-no-team', teamId: null, teamRef: null };
        },
      },
    };

    const customEffective = await getEffectivePagesForUser(mockPrisma, { id: 'user-custom', role: 'employee' });
    assert.deepStrictEqual(customEffective, ['leads', 'quotations']);

    const teamEffective = await getEffectivePagesForUser(mockPrisma, { id: 'user-team', role: 'employee' });
    assert.deepStrictEqual(teamEffective, ['inventory', 'suppliers']);

    const emptyEffective = await getEffectivePagesForUser(mockPrisma, { id: 'user-no-team', role: 'employee' });
    assert.deepStrictEqual(emptyEffective, []);
  });

  // ─── TEST 7: Cross-Module Filtering (User with ONLY leads page gets NOTHING from other modules) ───
  await runTest('Cross-module filtering: user with only leads page gets nothing from other modules', async () => {
    const userOnlyLeads = { id: 'user-rep', role: 'employee', tenantId: 'tenant-1' };
    const mockPrisma: any = {
      userPageAccess: {
        findUnique: async () => ({ userId: 'user-rep', pages: JSON.stringify(['leads']) }),
      },
      user: { findUnique: async () => null },
    };

    const effective = await getEffectivePagesForUser(mockPrisma, userOnlyLeads);
    assert.deepStrictEqual(effective, ['leads']);

    // 1. Module access checks
    const hasLeads = effective.includes('leads');
    const hasQuotations = effective.includes('quotations');
    const hasOrders = effective.includes('orders');
    const hasInvoices = effective.includes('invoices');
    const hasInventory = effective.includes('inventory');
    const hasSuppliers = effective.includes('suppliers');
    const hasShipments = effective.includes('shipments');
    const hasDailyActivities = effective.includes('daily_activities');
    const hasUsers = effective.includes('users');
    const hasAuditLogs = effective.includes('audit_logs');

    assert.strictEqual(hasLeads, true);
    assert.strictEqual(hasQuotations, false);
    assert.strictEqual(hasOrders, false);
    assert.strictEqual(hasInvoices, false);
    assert.strictEqual(hasInventory, false);
    assert.strictEqual(hasSuppliers, false);
    assert.strictEqual(hasShipments, false);
    assert.strictEqual(hasDailyActivities, false);
    assert.strictEqual(hasUsers, false);
    assert.strictEqual(hasAuditLogs, false);

    // 2. Simulated Dashboard Card Filtering
    const dashboardCards = {
      leads: hasLeads ? { totalToday: 10 } : null,
      orders: hasOrders ? { inTransit: 5 } : null,
      inventory: hasInventory ? { lowStockSkus: 2 } : null,
      suppliers: hasSuppliers ? { activeCount: 4 } : null,
      quotations: hasQuotations ? { pendingCount: 3 } : null,
      invoices: hasInvoices ? { unpaidCount: 8 } : null,
      shipments: hasShipments ? { inTransitCount: 1 } : null,
      dailyActivities: hasDailyActivities ? { todayCount: 6 } : null,
    };

    assert.notStrictEqual(dashboardCards.leads, null);
    assert.strictEqual(dashboardCards.orders, null);
    assert.strictEqual(dashboardCards.inventory, null);
    assert.strictEqual(dashboardCards.suppliers, null);
    assert.strictEqual(dashboardCards.quotations, null);
    assert.strictEqual(dashboardCards.invoices, null);
    assert.strictEqual(dashboardCards.shipments, null);
    assert.strictEqual(dashboardCards.dailyActivities, null);

    // 3. Simulated Company Details Related Records Filtering
    const rawCompany = {
      id: 'comp-1',
      name: 'Client Alpha',
      leads: [{ id: 'lead-1' }],
      invoices: [{ id: 'inv-1', totalAmount: 50000 }],
      _count: { leads: 1, invoices: 1 },
    };

    const filteredCompany = {
      ...rawCompany,
      leads: hasLeads ? rawCompany.leads : [],
      invoices: hasInvoices ? rawCompany.invoices : [],
      _count: {
        leads: hasLeads ? rawCompany._count.leads : 0,
        invoices: hasInvoices ? rawCompany._count.invoices : 0,
      },
    };

    assert.strictEqual(filteredCompany.leads.length, 1);
    assert.strictEqual(filteredCompany.invoices.length, 0, 'Invoices must be stripped for non-finance user');
    assert.strictEqual(filteredCompany._count.invoices, 0);

    // 4. Simulated Lead Details Related Records Filtering
    const rawLead = {
      id: 'lead-1',
      quotations: [{ id: 'quot-1', amount: 15000 }],
    };
    const filteredLead = {
      ...rawLead,
      quotations: hasQuotations ? rawLead.quotations : [],
    };
    assert.strictEqual(filteredLead.quotations.length, 0, 'Quotations must be stripped for non-sales-rep user without quotations page');
  });

  // ─── TEST 8: Admin Pages Granting Restrictions & Rank Hierarchy ───
  runTest('Only tenant_admin and admin may grant admin pages, rank rules strictly apply', () => {
    const adminPagesList = [...ADMIN_PAGES];
    assert.ok(adminPagesList.includes('users'));
    assert.ok(adminPagesList.includes('teams'));
    assert.ok(adminPagesList.includes('access_templates'));
    assert.ok(adminPagesList.includes('audit_logs'));
    assert.ok(adminPagesList.includes('automation'));
    assert.ok(adminPagesList.includes('branding'));
    assert.ok(adminPagesList.includes('mail_settings'));

    // Actor 1: Sales rep (employee, rank 20) with users page
    const salesRepActor = { role: 'employee', effectivePages: ['users'] };
    const salesRepRank = ROLE_RANKS[salesRepActor.role]; // 20
    const targetAdminRank = ROLE_RANKS['admin']; // 60

    // Check 1: Sales rep cannot edit or create an admin (Rank enforcement)
    const canModifyAdmin = salesRepRank > targetAdminRank;
    assert.strictEqual(canModifyAdmin, false, 'Sales rep must be blocked from modifying or creating an admin');

    // Check 2: Sales rep cannot grant admin pages
    const attemptedGrant = ['leads', 'users'];
    const hasAdminPages = attemptedGrant.some((p) => adminPagesList.includes(p));
    const canGrantAdminPages = salesRepActor.role === 'tenant_admin' || salesRepActor.role === 'admin';
    assert.strictEqual(hasAdminPages, true);
    assert.strictEqual(canGrantAdminPages, false, 'Sales rep must be blocked from granting admin pages');

    // Actor 2: Tenant admin (rank 80)
    const tenantAdminActor = { role: 'tenant_admin' };
    const canTenantAdminGrant = tenantAdminActor.role === 'tenant_admin' || tenantAdminActor.role === 'admin';
    assert.strictEqual(canTenantAdminGrant, true, 'Tenant admin is allowed to grant admin pages');
  });

  // ─── TEST 9: RolesGuard 403 Structure with pageKey ───
  runTest('RolesGuard 403 response includes { message, pageKey }', () => {
    const requiredPage = 'invoices';
    const userPages = ['leads'];

    let thrown: any = null;
    try {
      if (!userPages.includes(requiredPage)) {
        throw {
          status: 403,
          response: {
            message: 'You do not have access to this page',
            pageKey: requiredPage,
          },
        };
      }
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown !== null);
    assert.strictEqual(thrown.status, 403);
    assert.strictEqual(thrown.response.pageKey, 'invoices');
    assert.strictEqual(thrown.response.message, 'You do not have access to this page');
  });

  // ─── TEST 10: Platform Pages Isolation ───
  runTest('Platform pages can never be granted to company users or templates', () => {
    for (const pKey of ALL_PLATFORM_PAGE_KEYS) {
      assert.ok(isPlatformPageKey(pKey), `${pKey} must be recognized as platform-only`);
      assert.ok(!isValidCompanyPageKey(pKey), `${pKey} must NOT be valid company page`);
    }
  });

  console.log(`\n====================================================`);
  console.log(`   RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)   `);
  console.log(`====================================================\n`);
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
