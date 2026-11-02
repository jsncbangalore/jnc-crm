const fs = require('fs');
const path = require('path');
const ts = require('typescript');

console.log('====================================================');
console.log('  NAVIGATION ROUTES & ONE SOURCE AUDIT TEST (AST)   ');
console.log('====================================================\n');

// 1. Read allowlist
const allowlistPath = path.resolve(__dirname, 'navigation-allowlist.json');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
const allowedRoutes = new Set([...allowlist.allowedRoutes, ...allowlist.allowedSpecialTargets]);

// 2. Extract valid routes from COMPANY_PAGE_REGISTRY
const pageRegistryTsPath = path.resolve(__dirname, '../apps/web/src/config/page-registry.ts');
const pageRegistryContent = fs.readFileSync(pageRegistryTsPath, 'utf8');

// Simple extraction of frontendRoutes: ['/path', ...]
const routeRegex = /frontendRoutes:\s*\[([^\]]+)\]/g;
const canonicalRegistryRoutes = new Set();
let match;
while ((match = routeRegex.exec(pageRegistryContent)) !== null) {
  const routesStr = match[1];
  const items = routesStr.split(',').map((s) => s.trim().replace(/['"]/g, ''));
  items.forEach((r) => {
    if (r) canonicalRegistryRoutes.add(r);
  });
}

console.log(`[REGISTRY] Found ${canonicalRegistryRoutes.size} canonical routes from COMPANY_PAGE_REGISTRY.`);

// 3. Components to audit
const layoutComponents = [
  'apps/web/src/components/layout/Navbar.tsx',
  'apps/web/src/components/layout/Sidebar.tsx',
  'apps/web/src/components/layout/MobileDock.tsx',
  'apps/web/src/components/layout/AppLayout.tsx',
  'apps/web/src/components/layout/TeamPageGuard.tsx',
];

let errors = [];
let auditedLinksCount = 0;

for (const relPath of layoutComponents) {
  const absPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(absPath)) {
    errors.push(`File not found: ${relPath}`);
    continue;
  }

  const code = fs.readFileSync(absPath, 'utf8');

  // Verify that layout navigation surfaces import useAllowedPages
  if (relPath.includes('Navbar.tsx') || relPath.includes('Sidebar.tsx') || relPath.includes('MobileDock.tsx') || relPath.includes('TeamPageGuard.tsx')) {
    if (!code.includes('useAllowedPages')) {
      errors.push(`[ONE SOURCE ERROR] ${relPath} must import and use useAllowedPages()!`);
    }
  }

  // Check for forbidden hardcoded role arrays in navigation gating (e.g. ['admin', 'store_manager'].includes(user.role))
  const roleArrayPattern = /\['(admin|store_manager|sales_rep|field_technician|accountant|viewer|employee)'\s*,\s*'(admin|store_manager|sales_rep|field_technician|accountant|viewer|employee)'/g;
  if (roleArrayPattern.test(code)) {
    errors.push(`[ROLE ARRAY ERROR] ${relPath} contains hardcoded role array gating! Must use useAllowedPages() instead.`);
  }

  // AST traversal to inspect all Link/NavLink 'to' attributes and navigate() calls
  const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);

  function visit(node) {
    // Check JSX attributes: <Link to="..."> or <NavLink to="...">
    if (ts.isJsxAttribute(node) && (node.name.text === 'to' || node.name.text === 'href')) {
      if (node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          const target = node.initializer.text;
          auditedLinksCount++;
          checkTarget(target, relPath, node);
        }
      }
    }

    // Check navigate('/...') calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'navigate') {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const target = firstArg.text;
          auditedLinksCount++;
          checkTarget(target, relPath, node);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  function checkTarget(target, file, node) {
    // External links (http, mailto, tel) are ignored
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('tel:')) {
      return;
    }

    // Clean query/hash
    const cleanPath = target.split('?')[0].split('#')[0] || '/';

    // Must be in registry or allowlist
    const isAllowed =
      canonicalRegistryRoutes.has(cleanPath) ||
      allowedRoutes.has(cleanPath) ||
      cleanPath === '/' ||
      cleanPath === '' ||
      cleanPath.startsWith('/account') ||
      cleanPath.startsWith('/login') ||
      cleanPath.startsWith('/auth');

    if (!isAllowed) {
      errors.push(`[ILLEGAL ROUTE] ${file}: Link destination "${target}" is neither in COMPANY_PAGE_REGISTRY nor navigation-allowlist.json!`);
    }
  }

  visit(sourceFile);
  console.log(`  [OK] Audited ${relPath}`);
}

console.log(`\nAudited ${auditedLinksCount} static route links across layout navigation components.`);

if (errors.length > 0) {
  console.error('\nAUDIT FAILED with errors:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
} else {
  console.log('\n[ALL CHECKS PASSED] Every navigation surface uses useAllowedPages() and only valid canonical routes/allowlist!');
}
