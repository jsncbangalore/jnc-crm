/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('========================================================================');
console.log('TEST SUITE: Branding Split, Pre-Login Isolation, Legacy Reset & Guard');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

// ─── TEST 1: Pre-login Brand Isolation & Footer ─────────────────────────────
test('Pre-login AuthLayout strictly uses build config product brand, not cached company branding', () => {
  const authLayoutPath = path.resolve('apps/web/src/components/layout/AuthLayout.tsx');
  const code = fs.readFileSync(authLayoutPath, 'utf8');

  // Must use getProductName() directly, never branding.companyDisplayName
  assert(!code.includes('branding.companyDisplayName || getProductName()'), 'AuthLayout must not fallback to branding.companyDisplayName');
  assert(code.includes('const productName = getProductName();'), 'AuthLayout must use getProductName() directly');
  
  // BrandLogo must use productOnly={true}
  assert(code.includes('productOnly={true}'), 'BrandLogo on pre-login pages must enforce productOnly={true}');

  // Footer format: (c) {year} {product name}. All rights reserved.
  assert(code.includes('&copy; {new Date().getFullYear()} {productName}. All rights reserved.'), 'Footer copyright must display (c) {year} {productName}');
});

// ─── TEST 2: BrandLogo component text fallback ─────────────────────────────
test('BrandLogo renders product name as text when logo fails or missing in productOnly mode', () => {
  const brandLogoPath = path.resolve('apps/web/src/components/common/BrandLogo.tsx');
  const code = fs.readFileSync(brandLogoPath, 'utf8');

  assert(code.includes('productOnly = false'), 'BrandLogo must define productOnly prop');
  assert(code.includes('if (imgError || !logoSrc)'), 'BrandLogo must handle image error or missing logo');
  assert(code.includes('{displayName}'), 'BrandLogo must render text fallback for displayName');
});

// ─── TEST 3: Branding cache reset function ─────────────────────────────────
test('BrandingContext exports resetBrandingCache and clears storage', () => {
  const brandingCtxPath = path.resolve('apps/web/src/contexts/BrandingContext.tsx');
  const code = fs.readFileSync(brandingCtxPath, 'utf8');

  assert(code.includes('export const resetBrandingCache = () =>'), 'BrandingContext must export resetBrandingCache()');
  assert(code.includes("localStorage.removeItem(BRANDING_STORAGE_KEY)"), 'resetBrandingCache must remove app_branding from localStorage');
  assert(code.includes("sessionStorage.removeItem(BRANDING_STORAGE_KEY)"), 'resetBrandingCache must remove app_branding from sessionStorage');
});

// ─── TEST 4: AuthContext clears branding on logout and login ───────────────
test('AuthContext purges app_branding on logout and new user login', () => {
  const authCtxPath = path.resolve('apps/web/src/contexts/AuthContext.tsx');
  const code = fs.readFileSync(authCtxPath, 'utf8');

  assert(code.includes("localStorage.removeItem('app_branding')"), 'AuthContext must remove app_branding on logout/clearStorage');
  assert(code.includes("sessionStorage.removeItem('app_branding')"), 'AuthContext must remove app_branding from sessionStorage on logout');
});

// ─── TEST 5: Database schema has portalLogoUrl and migration exists ────────
test('Prisma schema and migrations support optional portalLogoUrl on Tenant', () => {
  const schemaPath = path.resolve('apps/api/prisma/schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert(schema.includes('portalLogoUrl       String?'), 'Tenant model in schema.prisma must define portalLogoUrl String?');

  const migrationDir = path.resolve('apps/api/prisma/migrations/20261026120000_add_portal_logo_to_tenant');
  assert(fs.existsSync(migrationDir), 'Migration directory for portal logo must exist');
  
  const migrationSql = fs.readFileSync(path.join(migrationDir, 'migration.sql'), 'utf8');
  assert(migrationSql.includes('portalLogoUrl'), 'migration.sql must add portalLogoUrl column');
});

// ─── TEST 6: Two logos endpoints in SettingsController & SettingsService ───
test('Settings service and controller split Document logo from Portal logo', () => {
  const ctrlPath = path.resolve('apps/api/src/settings/settings.controller.ts');
  const ctrl = fs.readFileSync(ctrlPath, 'utf8');

  // Verify Document logo endpoint
  assert(ctrl.includes("@Get('branding/logo')"), 'Must have GET /settings/branding/logo for Document logo');
  assert(ctrl.includes('Returns ONLY the Document logo'), 'Must document that public logo route returns only Document logo');

  // Verify Portal logo endpoints
  assert(ctrl.includes("@Post('branding/portal-logo')"), 'Must have POST /settings/branding/portal-logo');
  assert(ctrl.includes("@Get('branding/portal-logo')"), 'Must have GET /settings/branding/portal-logo');
  assert(ctrl.includes("@Delete('branding/portal-logo')"), 'Must have DELETE /settings/branding/portal-logo');

  const srvPath = path.resolve('apps/api/src/settings/settings.service.ts');
  const srv = fs.readFileSync(srvPath, 'utf8');

  assert(srv.includes('uploadPortalLogo(file: Express.Multer.File'), 'SettingsService must define uploadPortalLogo');
  assert(srv.includes('deletePortalLogo(user: ScopedUser'), 'SettingsService must define deletePortalLogo');
  assert(srv.includes('servePortalLogo(tenantKey'), 'SettingsService must define servePortalLogo');
});

// ─── TEST 7: PDF generator uses Document logo and never Portal logo ────────
test('PDF generator exclusively resolves Document logo (logoUrl)', () => {
  const pdfGenPath = path.resolve('apps/api/src/invoicing/pdf-generator.ts');
  const code = fs.readFileSync(pdfGenPath, 'utf8');

  assert(code.includes('const candidateLogo = profile.logoUrl || process.env.PRODUCT_LOGO_URL;'), 'PDF generator must use profile.logoUrl');
  assert(!code.includes('profile.portalLogoUrl'), 'PDF generator must NEVER use portalLogoUrl');
});

// ─── TEST 8: Portal header displays Portal logo only when set ──────────────
test('Portal header displays Portal logo when set and company text when unset', () => {
  const navbarPath = path.resolve('apps/web/src/components/layout/Navbar.tsx');
  const code = fs.readFileSync(navbarPath, 'utf8');

  assert(code.includes('{branding.portalLogoUrl ? ('), 'Navbar must conditionally render portalLogoUrl');
  assert(code.includes('data-testid="portal-header-logo"'), 'Navbar must assign testid to portal-header-logo');
  assert(code.includes('data-testid="portal-company-name"'), 'Navbar must render company name as text');
});

// ─── TEST 9: LEGACY_RESET_ENABLED Flag behavior ────────────────────────────
test('AuthController enforces LEGACY_RESET_ENABLED (410 when disabled, 403 for admin when enabled)', () => {
  const ctrlPath = path.resolve('apps/api/src/auth/auth.controller.ts');
  const ctrl = fs.readFileSync(ctrlPath, 'utf8');

  assert(ctrl.includes("if (process.env.LEGACY_RESET_ENABLED !== 'true')"), 'forgotPassword must check LEGACY_RESET_ENABLED');
  assert(ctrl.includes('statusCode: HttpStatus.GONE'), 'Must return 410 Gone when LEGACY_RESET_ENABLED is not true');
  assert(ctrl.includes('Scheduled for removal in v2.1'), 'Must document removal date in v2.1');

  const srvPath = path.resolve('apps/api/src/auth/auth.service.ts');
  const srv = fs.readFileSync(srvPath, 'utf8');

  assert(srv.includes("['platform_super_admin', 'tenant_admin', 'admin'].includes(existingUser.role)"), 'legacyForgotPassword must check privileged roles');
  assert(srv.includes("throw new ForbiddenException('Admin accounts must use the secure reset flow.')"), 'legacyForgotPassword must reject admin accounts with 403');
  assert(srv.includes('[AUDIT] Legacy forgot-password'), 'Must write audit logs for legacy calls');
});

// ─── TEST 10: Startup Migration Guard in Production ────────────────────────
test('main.ts implements startup migration guard before listen in production', () => {
  const mainPath = path.resolve('apps/api/src/main.ts');
  const code = fs.readFileSync(mainPath, 'utf8');

  assert(code.includes('async function verifyMigrationsAppliedOrExit'), 'main.ts must define verifyMigrationsAppliedOrExit');
  assert(code.includes('await verifyMigrationsAppliedOrExit(prismaService)'), 'main.ts must call verifyMigrationsAppliedOrExit before listen');
  assert(code.includes('[STARTUP BLOCKED]'), 'main.ts must print [STARTUP BLOCKED] when pending migrations exist');
  assert(code.includes('SELECT migration_name FROM "_prisma_migrations"'), 'main.ts must query _prisma_migrations table');
});

console.log('\n========================================================================');
console.log(`SUMMARY: ${passedTests} of ${totalTests} tests passed.`);
console.log('========================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
