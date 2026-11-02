/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ─── Browser Environment Simulation ──────────────────────────────────────────
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }
}

const mockStorage = new MockLocalStorage();
(global as any).window = {
  dispatchEvent: (event: any) => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { pathname: '/', search: '' },
};
(global as any).localStorage = mockStorage;
(global as any).CustomEvent = class {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

// In-memory TypeScript module loader
const moduleCache = new Map<string, any>();

function requireTsModule(relativeFilePath: string): any {
  const fullPath = path.resolve(__dirname, relativeFilePath);
  if (moduleCache.has(fullPath)) {
    return moduleCache.get(fullPath);
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const m: any = { exports: {} };
  const customRequire = (id: string) => {
    if (id.startsWith('.')) {
      const dir = path.dirname(fullPath);
      let target = path.resolve(dir, id);
      if (!fs.existsSync(target) && fs.existsSync(target + '.ts')) {
        target = target + '.ts';
      }
      return requireTsModule(target);
    }
    return require(id);
  };

  const fn = new Function('require', 'exports', 'module', transpiled);
  fn(customRequire, m.exports, m);
  moduleCache.set(fullPath, m.exports);
  return m.exports;
}

// Load Web TS modules
const storageInventory = requireTsModule('../apps/web/src/config/storage-inventory.ts');
const cookieConsent = requireTsModule('../apps/web/src/utils/cookieConsent.ts');

const {
  STORAGE_INVENTORY,
  POLICY_VERSION,
  POLICY_UPDATED_AT,
  COOKIE_CONSENT_KEY,
  KNOWN_LEGACY_KEYS,
} = storageInventory;

const {
  getConsent,
  setConsent,
  canStore,
  clearOptional,
  resetConsent,
  CONSENT_VALIDITY_MS,
} = cookieConsent;

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

console.log('========================================================================');
console.log('COOKIE CONSENT & STORAGE INVENTORY AUTOMATED VERIFICATION SUITE');
console.log('========================================================================\n');

// ─── TEST 1: Storage Inventory Completeness & Scanner ────────────────────────
console.log('--- 1. Storage Inventory Configuration & Codebase Usage Scan ---');
assert(Array.isArray(STORAGE_INVENTORY) && STORAGE_INVENTORY.length > 0, 'STORAGE_INVENTORY is defined and non-empty');
assert(typeof POLICY_VERSION === 'string' && POLICY_VERSION.length > 0, 'POLICY_VERSION is defined');
assert(typeof POLICY_UPDATED_AT === 'string' && POLICY_UPDATED_AT.length > 0, 'POLICY_UPDATED_AT is defined');

// Scan apps/web/src for any storage key not declared in storage-inventory.ts
function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allWebFiles = walkDir(path.resolve(__dirname, '../apps/web/src'));
const inventoryKeyNames = new Set([
  ...STORAGE_INVENTORY.map((item: any) => item.name),
  ...KNOWN_LEGACY_KEYS,
]);

// Extract literal string keys passed to localStorage, sessionStorage, or document.cookie
const undeclaredKeys: Array<{ file: string; line: number; key: string }> = [];
const storageRegex = /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const cookieRegex = /document\.cookie\s*=\s*['"`]([a-zA-Z0-9_]+)=/g;

for (const file of allWebFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    let match: RegExpExecArray | null;

    // Check localStorage / sessionStorage calls
    storageRegex.lastIndex = 0;
    while ((match = storageRegex.exec(line)) !== null) {
      const key = match[1];
      if (!inventoryKeyNames.has(key)) {
        undeclaredKeys.push({ file: path.relative(process.cwd(), file), line: idx + 1, key });
      }
    }

    // Check document.cookie calls
    cookieRegex.lastIndex = 0;
    while ((match = cookieRegex.exec(line)) !== null) {
      const key = match[1];
      if (!inventoryKeyNames.has(key)) {
        undeclaredKeys.push({ file: path.relative(process.cwd(), file), line: idx + 1, key });
      }
    }
  });
}

assert(
  undeclaredKeys.length === 0,
  'All storage keys used in apps/web/src are declared in storage-inventory.ts',
  undeclaredKeys.map((u) => `${u.key} (${u.file}:${u.line})`).join(', ')
);

// ─── TEST 2: No Optional Write Before Consent ────────────────────────────────
console.log('\n--- 2. No Optional Write Before Consent ---');
mockStorage.clear();
assert(getConsent() === null, 'Initial state: getConsent() returns null when no record exists');
assert(canStore('preferences') === false, 'canStore("preferences") is false when no consent exists');
assert(canStore('necessary') === true, 'canStore("necessary") is always true for essential operation');

// ─── TEST 3: Reject Removes Optional Keys ────────────────────────────────────
console.log('\n--- 3. Reject Removes Optional Keys (necessary_only) ---');
// Pre-populate some preference keys
mockStorage.setItem('crm_theme', 'dark');
mockStorage.setItem('crm_show_bills_kpis', 'true');
mockStorage.setItem('crm_inventory_buy_list', JSON.stringify([{ id: 'item-1' }]));

// User rejects optional cookies
const rejectRecord = setConsent('necessary_only');
assert(rejectRecord.choice === 'necessary_only', 'Record choice is necessary_only');
assert(rejectRecord.preferences === false, 'Record preferences is false');
assert(mockStorage.getItem('crm_theme') === null, 'clearOptional() removed crm_theme');
assert(mockStorage.getItem('crm_show_bills_kpis') === null, 'clearOptional() removed crm_show_bills_kpis');
assert(mockStorage.getItem('crm_inventory_buy_list') === null, 'clearOptional() removed crm_inventory_buy_list');
assert(canStore('preferences') === false, 'canStore("preferences") remains false after rejection');

// ─── TEST 4: Accept Enables Optional Storage ─────────────────────────────────
console.log('\n--- 4. Accept All Enables Preferences Storage ---');
const acceptRecord = setConsent('all');
assert(acceptRecord.choice === 'all', 'Record choice is all');
assert(acceptRecord.preferences === true, 'Record preferences is true');
assert(canStore('preferences') === true, 'canStore("preferences") is true after accepting all');

// Verify preference writing is allowed
mockStorage.setItem('crm_theme', 'light');
assert(mockStorage.getItem('crm_theme') === 'light', 'Preference write succeeded with consent');

// ─── TEST 5: New Choice Replaces Old Record Under One Key ────────────────────
console.log('\n--- 5. New Choice Replaces Old Record Under Single Key ---');
const customRecord = setConsent('custom', true);
assert(customRecord.choice === 'custom' && customRecord.preferences === true, 'Custom consent with preferences saved');

// Verify stored in single key
const storedRaw = mockStorage.getItem(COOKIE_CONSENT_KEY);
assert(storedRaw !== null, 'Record exists under single key crm_cookie_consent');
const parsedStored = JSON.parse(storedRaw!);
assert(parsedStored.choice === 'custom', 'Stored record has updated choice "custom"');
assert(parsedStored.policyVersion === POLICY_VERSION, 'Stored record contains current policyVersion');
assert(typeof parsedStored.savedAt === 'string', 'Stored record contains savedAt timestamp');

// Change choice to necessary_only
const newRejectRecord = setConsent('necessary_only');
const updatedRaw = mockStorage.getItem(COOKIE_CONSENT_KEY);
const parsedUpdated = JSON.parse(updatedRaw!);
assert(parsedUpdated.choice === 'necessary_only', 'Updated record replaced old record under same key');
assert(parsedUpdated.preferences === false, 'Updated record has preferences=false');

// ─── TEST 6: Record Expires After 12 Months ──────────────────────────────────
console.log('\n--- 6. Record Expires After 12 Months ---');
// Save record with savedAt timestamp 366 days ago
const oldTimestamp = new Date(Date.now() - (CONSENT_VALIDITY_MS + 24 * 60 * 60 * 1000)).toISOString();
mockStorage.setItem(
  COOKIE_CONSENT_KEY,
  JSON.stringify({
    choice: 'all',
    preferences: true,
    policyVersion: POLICY_VERSION,
    savedAt: oldTimestamp,
  })
);
assert(getConsent() === null, 'getConsent() returns null for record older than 12 months');
assert(canStore('preferences') === false, 'canStore("preferences") is false after expiration');

// ─── TEST 7: Record Expires When Policy Version Changes ──────────────────────
console.log('\n--- 7. Record Invalidation on Policy Version Change ---');
mockStorage.setItem(
  COOKIE_CONSENT_KEY,
  JSON.stringify({
    choice: 'all',
    preferences: true,
    policyVersion: '2025.01.01-OLD',
    savedAt: new Date().toISOString(),
  })
);
assert(getConsent() === null, 'getConsent() returns null when policyVersion differs from current POLICY_VERSION');

// ─── TEST 8: Banner Hidden on Public Form & Inquiry Routes ───────────────────
console.log('\n--- 8. Banner Hidden on Public Form Routes ---');
function isBannerShownOnRoute(pathname: string, search: string = ''): boolean {
  const path = pathname.toLowerCase();
  const query = search.toLowerCase();
  const isExcludedPage =
    path.startsWith('/inquiry') ||
    path.startsWith('/quote-request') ||
    path === '/cookies' ||
    path === '/cookie-policy' ||
    query.includes('embed=true');

  if (isExcludedPage) return false;
  return getConsent() === null;
}

// Reset consent so unconsented state would normally show banner on standard pages
mockStorage.clear();
assert(isBannerShownOnRoute('/dashboard') === true, 'Banner is shown on /dashboard when unconsented');
assert(isBannerShownOnRoute('/login') === true, 'Banner is shown on /login when unconsented');
assert(isBannerShownOnRoute('/inquiry') === false, 'Banner is hidden on /inquiry');
assert(isBannerShownOnRoute('/quote-request') === false, 'Banner is hidden on /quote-request');
assert(isBannerShownOnRoute('/inquiry?key=abc') === false, 'Banner is hidden on /inquiry with key param');
assert(isBannerShownOnRoute('/dashboard', '?embed=true') === false, 'Banner is hidden when embedded via embed=true');
assert(isBannerShownOnRoute('/cookies') === false, 'Banner is hidden on /cookies policy page');

// Verify PublicInquiryPage sets 0 cookies and 0 storage
const publicInquiryContent = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/pages/PublicInquiryPage.tsx'), 'utf8');
assert(!publicInquiryContent.includes('localStorage.setItem'), 'PublicInquiryPage has 0 localStorage.setItem calls');
assert(!publicInquiryContent.includes('sessionStorage.setItem'), 'PublicInquiryPage has 0 sessionStorage.setItem calls');
assert(!publicInquiryContent.includes('document.cookie'), 'PublicInquiryPage has 0 document.cookie writes');

console.log('\n========================================================================');
console.log(`TOTAL COOKIE CONSENT ASSERTIONS: ${passed + failed}`);
console.log(`PASSED:                       ${passed}`);
console.log(`FAILED:                       ${failed}`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('[PASS] ALL COOKIE CONSENT & STORAGE INVENTORY TESTS PASSED!\n');
}
