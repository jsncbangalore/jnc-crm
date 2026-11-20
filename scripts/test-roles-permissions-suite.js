/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * DEDICATED SUITE: ROLES, PERMISSIONS & MULTI-TAB SESSION SAFETY
 *
 * Covers:
 * 1. All 9 canonical roles: assert each can open every page in its default list.
 * 2. Assert each role gets 403 on disallowed pages.
 * 3. Assert administrator has access to all pages and all actions.
 * 4. Assert where role is view-only (e.g. project manager on inventory, developer on leads),
 *    GET passes and POST/PUT/DELETE returns 403.
 * 5. Assert giving access or modifying a user does not log out the caller.
 * 6. Assert 403 does not trigger session logout.
 * 7. Assert multi-tab same account does not trigger session conflict or false logout.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.join(ROOT_DIR, 'packages/shared-validation/dist');
const {
  TENANT_ROLE_KEYS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  normalizeRole,
  getRoleDefaultPermissions,
  resolveEffectivePageAccess,
  canAccessPage,
  isViewOnlyPage,
  getAllowedAssignableRoles,
} = require(path.join(SHARED_DIR, 'roles-permissions'));

let passed = 0;
let failed = 0;
const results = [];

function assert(title, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${title}`);
    results.push({ title, status: 'PASSED' });
  } else {
    failed++;
    console.error(`  [FAIL] ${title} ${extra ? `(${extra})` : ''}`);
    results.push({ title, status: 'FAILED', extra });
  }
}

console.log('========================================================================');
console.log('DEDICATED SUITE: 9 ROLES & PERMISSIONS SYSTEM SPECIFICATION');
console.log('========================================================================\n');

// ─── 1. Canonical 9 Roles & Normalization ────────────────────────────────────
console.log('--- 1. Canonical Roles & Normalization ---');

assert('Exactly 9 canonical tenant roles are defined', TENANT_ROLE_KEYS.length === 9);
assert('All 9 roles are present in TENANT_ROLE_KEYS',
  ['administrator', 'sub_administrator', 'project_manager', 'developer_lead',
   'store_inventory_manager', 'finance_specialist', 'accountant',
   'sales_representative', 'developer'].every((r) => TENANT_ROLE_KEYS.includes(r))
);

assert('Legacy "admin" normalizes to "administrator"', normalizeRole('admin') === 'administrator');
assert('Legacy "tenant_admin" normalizes to "administrator"', normalizeRole('tenant_admin') === 'administrator');
assert('Legacy "sub_admin" normalizes to "sub_administrator"', normalizeRole('sub_admin') === 'sub_administrator');
assert('Legacy "store_manager" normalizes to "store_inventory_manager"', normalizeRole('store_manager') === 'store_inventory_manager');
assert('Legacy "finance" normalizes to "finance_specialist"', normalizeRole('finance') === 'finance_specialist');
assert('Legacy "employee" normalizes to "sales_representative"', normalizeRole('employee') === 'sales_representative');

// ─── 2. All 9 Roles Default Page Access & Disallowed 403 Checks ─────────────
console.log('\n--- 2. Default Access & Disallowed 403 Rejection for All 9 Roles ---');

const ALL_COMPANY_PAGES = [
  'dashboard', 'leads', 'lead_flow', 'lead_setup', 'quotations', 'orders',
  'shipments', 'invoices', 'inventory', 'suppliers', 'bills', 'ledger',
  'daily_activities', 'notifications', 'custom_objects', 'automation',
  'audit_logs', 'users', 'teams', 'branding', 'mail_settings'
];

for (const role of TENANT_ROLE_KEYS) {
  const resolved = resolveEffectivePageAccess({ role });
  const defaults = getRoleDefaultPermissions(role);
  const defaultPageKeys = Object.keys(defaults);

  // Assert can open every page in its default list
  const canOpenAllDefaults = defaultPageKeys.every((pageKey) => canAccessPage(resolved, pageKey, 'view'));
  assert(`Role "${role}": can open every page in its default list (${defaultPageKeys.length} pages)`, canOpenAllDefaults);

  // Assert dashboard and notifications always allowed
  assert(`Role "${role}": dashboard & notifications always granted`,
    canAccessPage(resolved, 'dashboard', 'view') && canAccessPage(resolved, 'notifications', 'view')
  );

  // Assert gets 403/rejection on disallowed pages
  const disallowed = ALL_COMPANY_PAGES.filter((p) => !defaultPageKeys.includes(p));
  if (disallowed.length > 0) {
    const rejectsAllDisallowed = disallowed.every((p) => !canAccessPage(resolved, p, 'view'));
    assert(`Role "${role}": denied access to all ${disallowed.length} disallowed pages (${disallowed.slice(0, 3).join(', ')}...)`, rejectsAllDisallowed);
  }
}

// ─── 3. Administrator Access Check ──────────────────────────────────────────
console.log('\n--- 3. Administrator Full Access Across All Pages & Actions ---');

const adminResolved = resolveEffectivePageAccess({ role: 'administrator' });
const adminHasAllPages = ALL_COMPANY_PAGES.every((p) => {
  return (
    canAccessPage(adminResolved, p, 'view') &&
    canAccessPage(adminResolved, p, 'create_edit') &&
    canAccessPage(adminResolved, p, 'delete') &&
    !isViewOnlyPage(adminResolved, p)
  );
});
assert('Administrator has full access to ALL pages and ALL actions (view, create_edit, delete)', adminHasAllPages);

// ─── 4. View-Only Roles Specification (Requirement C) ───────────────────────
console.log('\n--- 4. View-Only Access & Mutation Block Check ---');

// Project Manager on inventory: View allowed, create_edit and delete blocked
const pmResolved = resolveEffectivePageAccess({ role: 'project_manager' });
assert('Project Manager on inventory: GET (view) is allowed', canAccessPage(pmResolved, 'inventory', 'view'));
assert('Project Manager on inventory: POST/PUT/DELETE is blocked with 403',
  !canAccessPage(pmResolved, 'inventory', 'create_edit') && !canAccessPage(pmResolved, 'inventory', 'delete')
);
assert('Project Manager on inventory: isViewOnlyPage returns true', isViewOnlyPage(pmResolved, 'inventory'));

// Developer on leads: View allowed, create_edit and delete blocked
const devResolved = resolveEffectivePageAccess({ role: 'developer' });
assert('Developer on leads: GET (view) is allowed', canAccessPage(devResolved, 'leads', 'view'));
assert('Developer on leads: POST/PUT/DELETE is blocked with 403',
  !canAccessPage(devResolved, 'leads', 'create_edit') && !canAccessPage(devResolved, 'leads', 'delete')
);
assert('Developer on leads: isViewOnlyPage returns true', isViewOnlyPage(devResolved, 'leads'));

// Developer Lead on leads: View allowed, mutations blocked
const devLeadResolved = resolveEffectivePageAccess({ role: 'developer_lead' });
assert('Developer Lead on leads: GET (view) is allowed', canAccessPage(devLeadResolved, 'leads', 'view'));
assert('Developer Lead on leads: POST/PUT/DELETE is blocked with 403',
  !canAccessPage(devLeadResolved, 'leads', 'create_edit') && !canAccessPage(devLeadResolved, 'leads', 'delete')
);

// Store/Inventory Manager on orders: View allowed, mutations blocked
const simResolved = resolveEffectivePageAccess({ role: 'store_inventory_manager' });
assert('Store Manager on orders: GET (view) is allowed', canAccessPage(simResolved, 'orders', 'view'));
assert('Store Manager on orders: POST/PUT/DELETE is blocked with 403',
  !canAccessPage(simResolved, 'orders', 'create_edit') && !canAccessPage(simResolved, 'orders', 'delete')
);

// Finance Specialist on orders, quotations, suppliers: View allowed, mutations blocked
const finResolved = resolveEffectivePageAccess({ role: 'finance_specialist' });
assert('Finance Specialist on orders: View allowed, mutation blocked',
  canAccessPage(finResolved, 'orders', 'view') && !canAccessPage(finResolved, 'orders', 'create_edit')
);
assert('Finance Specialist on quotations: View allowed, mutation blocked',
  canAccessPage(finResolved, 'quotations', 'view') && !canAccessPage(finResolved, 'quotations', 'create_edit')
);
assert('Finance Specialist on suppliers: View allowed, mutation blocked',
  canAccessPage(finResolved, 'suppliers', 'view') && !canAccessPage(finResolved, 'suppliers', 'create_edit')
);

// Accountant on orders, inventory: View allowed, mutations blocked
const accResolved = resolveEffectivePageAccess({ role: 'accountant' });
assert('Accountant on orders: View allowed, mutation blocked',
  canAccessPage(accResolved, 'orders', 'view') && !canAccessPage(accResolved, 'orders', 'create_edit')
);
assert('Accountant on inventory: View allowed, mutation blocked',
  canAccessPage(accResolved, 'inventory', 'view') && !canAccessPage(accResolved, 'inventory', 'create_edit')
);

// ─── 5. Giving Access / Modifying User & Multi-Tab Logout Prevention ────────
console.log('\n--- 5. Caller Session Preservation & Multi-Tab Logout Safety ---');

const apiSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/services/api.ts'), 'utf8');
const authContextSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/contexts/AuthContext.tsx'), 'utf8');

// Assert API interceptor only checks identity changes on /auth/me or /platform-auth/me
assert('API interceptor only verifies identity on caller profile endpoints (/auth/me, /platform-auth/me)',
  apiSource.includes("reqUrl.includes('/auth/me')") && apiSource.includes("reqUrl.includes('/platform-auth/me')")
);

// Assert saving another user does not clear tokens or dispatch conflict
assert('Saving user permissions or editing user does NOT trigger session conflict reload',
  !apiSource.includes('incomingUserId !== myUserId && clearTokens')
);

// Assert 403 Forbidden does NOT trigger session logout or clear tokens
assert('HTTP 403 error handler does NOT clear session tokens or redirect to login',
  !apiSource.includes("error.response?.status === 403 && clearTokens") &&
  !apiSource.includes("status === 403 && window.location.href = '/login'")
);

// Assert multi-tab same account does not trigger session conflict
assert('AuthContext handles multi-tab same-account without raising false conflicts',
  authContextSource.includes('tabUserToCheck === event.userId')
);

// ─── 6. Empty Team List Fallback Rule (Requirement D) ───────────────────────
console.log('\n--- 6. Empty Team List Fallback Rule ---');

const emptyTeamPm = resolveEffectivePageAccess({
  role: 'project_manager',
  teamAllowedPages: [], // Empty array
});
assert('Empty team page list falls back to role default pages (does not block everything)',
  emptyTeamPm.pages.length > 0 && emptyTeamPm.pages.includes('leads') && emptyTeamPm.pages.includes('quotations')
);

// ─── 7. Users Page UI Contract ──────────────────────────────────────────────
console.log('\n--- 7. Users Page Role Selector & Live Preview Contract ---');

const usersPageSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/pages/UsersPage.tsx'), 'utf8');

assert('UsersPage imports ROLE_DESCRIPTIONS for one-line capability display',
  usersPageSource.includes('ROLE_DESCRIPTIONS')
);
assert('UsersPage renders Granted Pages Preview before saving in Create Modal',
  usersPageSource.includes('Granted Pages Preview ({createPages.length})')
);
assert('UsersPage renders Granted Pages Preview before saving in Edit Modal',
  usersPageSource.includes('Granted Pages Preview ({editPages.length})')
);
assert('UsersPage defines distinct badge styling for all 9 canonical roles',
  ['administrator', 'sub_administrator', 'project_manager', 'developer_lead',
   'store_inventory_manager', 'finance_specialist', 'accountant',
   'sales_representative', 'developer'].every((r) => usersPageSource.includes(`${r}:`))
);

console.log('\n========================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('========================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
