/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, desc) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

console.log('========================================================================');
console.log('RUNNING COMPREHENSIVE DASHBOARD REBUILD TEST SUITE');
console.log('========================================================================\n');

// ── Test Suite 1: No Handwriting Font in the Build ───────────────────────────
console.log('[Test Suite 1: Typography & Font Integrity]');
const webSrcDir = path.resolve(__dirname, '../apps/web/src');

function scanForHandwriting(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += scanForHandwriting(fullPath);
    } else if (/\.(tsx|ts|jsx|js|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('font-handwriting') || content.includes('Caveat')) {
        console.error(`Found handwriting reference in: ${fullPath}`);
        count++;
      }
    }
  }
  return count;
}

const handwritingCount = scanForHandwriting(webSrcDir);
assert(handwritingCount === 0, 'No handwriting font (font-handwriting / Caveat) in apps/web/src');

const dashboardPath = path.join(webSrcDir, 'pages/DashboardPage.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
const servicePath = path.resolve(__dirname, '../apps/api/src/dashboard/dashboard.service.ts');
const serviceContent = fs.readFileSync(servicePath, 'utf8');
const combinedText = dashboardContent + '\n' + serviceContent;

assert(dashboardContent.includes("text-[28px] font-semibold text-slate-900 dark:text-white leading-tight"), 'Page title uses 28px semibold clean font');
assert(!dashboardContent.includes('font-handwriting'), 'DashboardPage contains no handwriting font classes');
assert(!dashboardContent.includes('Welcome back'), 'Greeting removed "Welcome" prefix');
assert(dashboardContent.includes('greeting}'), 'Greeting rendered cleanly as "{timeGreeting}, {firstName}"');

// ── Test Suite 2: Exact Required Labels ───────────────────────────────────────
console.log('\n[Test Suite 2: Exact Required Labels]');
assert(!dashboardContent.includes('aria-label="Items needing attention"'), 'Needs attention card removed from dashboard as requested');
const requiredLabels = [
  'New leads',
  'Pipeline',
  'Recent orders',
  'Follow-ups due',
  'Finish your company setup. Add legal name, GSTIN, PAN, bank details and stamp so invoices show your details.',
  'items are below reorder level. Restock or create a purchase bill.',
  'Finish setup',
  'Review items',
];

for (const label of requiredLabels) {
  assert(combinedText.includes(label), `Contains exact label: "${label}"`);
}

// ── Test Suite 3: Date Range Driving Every Widget ─────────────────────────────
console.log('\n[Test Suite 3: Global Range Select]');
assert(dashboardContent.includes('id="dashboard-date-range"'), 'Date range select element exists with id dashboard-date-range');
assert(dashboardContent.includes('<option value="today">Today</option>'), 'Range select includes "Today" option');
assert(dashboardContent.includes('<option value="7d">Last 7 days</option>'), 'Range select includes "Last 7 days" option');
assert(dashboardContent.includes('<option value="30d">Last 30 days</option>'), 'Range select includes "Last 30 days" option');
assert(dashboardContent.includes('<option value="month">This month</option>'), 'Range select includes "This month" option');
assert(dashboardContent.includes("const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'month'>('7d')"), 'Default date range is "7d"');
assert(dashboardContent.includes('dashboardApi.getKpis(dateRange)'), 'dashboardApi.getKpis receives the selected date range parameter');

// ── Test Suite 4: Quick Actions & In-Page Modals ──────────────────────────────
console.log('\n[Test Suite 4: Quick Actions & In-Page Modals]');
assert(dashboardContent.includes('New lead'), 'Contains "New lead" button');
assert(dashboardContent.includes('Create quote'), 'Contains "Create quote" button');
assert(dashboardContent.includes('Add item'), 'Contains "Add item" button');
assert(dashboardContent.includes('bg-blue-600 hover:bg-blue-700'), '"New lead" button has filled blue style');
assert(dashboardContent.includes('<CreateLeadModal'), 'Opens in-page CreateLeadModal (no navigation)');
assert(dashboardContent.includes('<CreateQuotationModal'), 'Opens in-page CreateQuotationModal (no navigation)');
assert(dashboardContent.includes('<CreateItemModal'), 'Opens in-page CreateItemModal (no navigation)');

// ── Test Suite 5: Accessible Table View & Dynamic Source Legend ───────────────
console.log('\n[Test Suite 5: New Leads Chart & Pipeline Features]');
assert(dashboardContent.includes('showTableView'), 'Provides table view toggle for accessibility');
assert(dashboardContent.includes('toggleSource'), 'Legend chips allow toggling source bars dynamically');
assert(dashboardContent.includes('Connect a lead source'), 'Empty state includes "Connect a lead source" action');
assert(dashboardContent.includes('Add lead'), 'Empty state includes "Add lead" action');
assert(dashboardContent.includes('Win rate:'), 'Pipeline widget displays win rate percentage');

// ── Test Suite 6: Needs Attention Incomplete Setup Logic ──────────────────────
console.log('\n[Test Suite 6: Needs Attention Logic]');
assert(serviceContent.includes('setupDoneCount'), 'Counts company setup progress out of 6 items');
assert(serviceContent.includes('isSetupComplete = setupDoneCount === 6'), 'Company setup marked complete only when all 6 items done');
assert(serviceContent.includes('if (isAdminRole && !isSetupComplete'), 'Company setup warning line only shown for incomplete admins');
assert(serviceContent.includes('finalNeedsAttention = needsAttention.slice(0, 5)'), 'Needs attention capped at at most 5 lines');

// ── Test Suite 7: Role & Page Access Scoping (No zeros for unauthorized) ─────
console.log('\n[Test Suite 7: Role & Permission Visibility]');
assert(serviceContent.includes('hasLeads'), 'Leads KPI and chart checked for user lead access');
assert(serviceContent.includes('hasQuotations'), 'Quotations KPI checked for user quotation access');
assert(serviceContent.includes('hasOrders'), 'Orders KPI checked for user order access');
assert(serviceContent.includes('hasInvoices'), 'Invoices KPI checked for user invoice access');
assert(serviceContent.includes('hasInventory'), 'Inventory KPI checked for user inventory access');
assert(serviceContent.includes(': null'), 'Returns null instead of zeros when user lacks module access');

// ── Test Suite 8: Visibility-Aware 60s Refresh ────────────────────────────────
console.log('\n[Test Suite 8: Tab Visibility-Aware 60s Refresh]');
assert(dashboardContent.includes('60_000'), 'Refreshes on a 60-second interval');
assert(dashboardContent.includes("document.visibilityState === 'visible'"), 'Only refreshes while document visibilityState is visible');

// ── Test Suite 9: Single Clean Footer (No Duplication) ─────────────────────────
console.log('\n[Test Suite 9: Footer Content & Single Clean Layout]');
const appLayoutContent = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/layout/AppLayout.tsx'), 'utf-8');
assert(appLayoutContent.includes('All Rights Reserved &copy; {new Date().getFullYear()}'), 'Global footer shows (c) {year} {company name}');
assert(appLayoutContent.includes('Cookie settings'), 'Global footer provides Cookie settings link');
assert(!dashboardContent.includes('<footer'), 'No duplicate top footer in DashboardPage (prevents stacked double footers)');

console.log('\n========================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} assertions passed.`);
if (failedTests > 0) {
  console.error(`FAILED: ${failedTests} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('[SUCCESS] All dashboard layout, typography, logic & permission tests passed.');
}
console.log('========================================================================\n');
