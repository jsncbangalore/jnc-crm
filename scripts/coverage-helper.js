/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function walkDir(dir, filterFn) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(filePath, filterFn));
    } else if (!filterFn || filterFn(filePath)) {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * Scans all NestJS controllers and extracts every route endpoint.
 */
function scanControllerRoutes() {
  const controllerFiles = walkDir(path.join(ROOT_DIR, 'apps/api/src'), (p) => p.endsWith('.controller.ts'));
  const routes = [];

  for (const file of controllerFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const ctrlMatch = content.match(/@Controller\s*\(\s*['"]?([^'")\s]*)['"]?\s*\)/);
    const basePath = ctrlMatch ? ctrlMatch[1].replace(/^\/+|\/+$/g, '') : '';
    const headerPart = content.split('export class')[0] || '';
    const classHasJwt = headerPart.includes("AuthGuard('jwt')") || headerPart.includes('AuthGuard("jwt")');
    const classHasRoles = headerPart.includes('RolesGuard');
    const classPublic = headerPart.includes('@Public()');

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const methodMatch = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(\s*['"]?([^'")\s]*)['"]?\s*\)/);
      if (methodMatch) {
        const verb = methodMatch[1].toUpperCase();
        const sub = methodMatch[2].replace(/^\/+|\/+$/g, '');
        const fullPath = '/' + [basePath, sub].filter(Boolean).join('/');

        // Check decorators surrounding the method declaration (preceding lines and following line until method signature)
        let hasMethodJwt = false;
        let isMethodPublic = false;
        let hasMethodRoles = false;
        let hasMethodPageAccess = false;

        const startIdx = Math.max(0, i - 8);
        const endIdx = Math.min(lines.length - 1, i + 5);
        for (let j = startIdx; j <= endIdx; j++) {
          const l = lines[j];
          if (l.includes("AuthGuard('jwt')") || l.includes('AuthGuard("jwt")')) hasMethodJwt = true;
          if (l.includes('@Public()') || l.includes('@Public')) isMethodPublic = true;
          if (l.includes('@Roles(')) hasMethodRoles = true;
          if (l.includes('@PageAccess(')) hasMethodPageAccess = true;
        }

        const isPublic = isMethodPublic || classPublic;
        const hasAuthGuard = classHasJwt || hasMethodJwt || isPublic;
        const hasRoles = classHasRoles || hasMethodRoles || hasMethodPageAccess;

        routes.push({
          verb,
          path: fullPath,
          endpoint: `${verb} ${fullPath}`,
          controller: path.basename(file),
          filePath: file,
          isPublic,
          hasAuthGuard,
          hasRoles,
        });
      }
    }
  }

  return routes;
}

/**
 * Scans all pages in apps/web/src/pages
 */
function scanPages() {
  const pagesDir = path.join(ROOT_DIR, 'apps/web/src/pages');
  const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.tsx'));
  return pageFiles.map((file) => ({
    name: file.replace('.tsx', ''),
    file,
    path: path.join(pagesDir, file),
  }));
}

/**
 * Scans all buttons in apps/web/src
 */
function scanButtons() {
  const webFiles = walkDir(path.join(ROOT_DIR, 'apps/web/src'), (p) => p.endsWith('.tsx'));
  const buttons = [];

  for (const file of webFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('<button') || line.includes('data-testid=') && line.includes('btn')) {
        const testIdMatch = line.match(/data-testid="([^"]+)"/);
        const ariaMatch = line.match(/aria-label="([^"]+)"/);
        const textMatch = line.match(/>([^<>{]+)<\/button>/);
        const name = testIdMatch ? testIdMatch[1] : ariaMatch ? ariaMatch[1] : textMatch ? textMatch[1].trim() : `button-L${i + 1}`;
        if (name) {
          buttons.push({
            name,
            file: path.relative(ROOT_DIR, file),
            line: i + 1,
          });
        }
      }
    }
  }

  return buttons;
}

/**
 * Reads all test scripts to find covered routes, pages, and buttons.
 */
function getCoverageMetrics() {
  const allRoutes = scanControllerRoutes();
  const allPages = scanPages();
  const allButtons = scanButtons();

  // Read all test scripts in scripts/
  const testScripts = walkDir(path.join(ROOT_DIR, 'scripts'), (p) => p.endsWith('.js') && (p.includes('test-') || p.includes('-test')));
  const combinedTestText = testScripts
    .map((s) => {
      try { return fs.readFileSync(s, 'utf8'); } catch { return ''; }
    })
    .join('\n');

  // Also include apps/api/src/**/*.spec.ts if present
  const specFiles = walkDir(path.join(ROOT_DIR, 'apps/api/src'), (p) => p.endsWith('.spec.ts'));
  const combinedSpecText = specFiles
    .map((s) => {
      try { return fs.readFileSync(s, 'utf8'); } catch { return ''; }
    })
    .join('\n');

  const fullCorpus = combinedTestText + '\n' + combinedSpecText;

  // Check route coverage
  const coveredRoutes = [];
  const uncoveredRoutes = [];

  for (const r of allRoutes) {
    // Normalize path for matching (e.g. replace :id with parameter or regex)
    const rawPath = r.path;
    const cleanSub = rawPath.replace(/\/:[a-zA-Z0-9_]+/g, '');
    const verbCheck = r.verb.toLowerCase();

    // Check if cleanSub is mentioned in the test corpus or contract tests
    const isDirectMatch = fullCorpus.includes(rawPath) || (cleanSub.length > 2 && fullCorpus.includes(cleanSub));
    const isVerbMatch = fullCorpus.toLowerCase().includes(verbCheck) && isDirectMatch;

    if (isDirectMatch) {
      coveredRoutes.push(r);
    } else {
      uncoveredRoutes.push(r);
    }
  }

  // Check page coverage
  const coveredPages = [];
  const uncoveredPages = [];

  for (const p of allPages) {
    const pageBase = p.name.replace(/Page$/, '');
    const slug = pageBase.toLowerCase();
    const isCovered =
      fullCorpus.includes(p.file) ||
      fullCorpus.includes(p.name) ||
      fullCorpus.includes(`/${slug}`) ||
      fullCorpus.includes(`'${slug}'`) ||
      fullCorpus.includes(`"${slug}"`);

    if (isCovered) {
      coveredPages.push(p);
    } else {
      uncoveredPages.push(p);
    }
  }

  // Check button coverage (from button-inventory.csv and test scripts)
  const buttonInvPath = path.join(ROOT_DIR, 'test-results/button-inventory.csv');
  let recordedButtons = [];
  if (fs.existsSync(buttonInvPath)) {
    const lines = fs.readFileSync(buttonInvPath, 'utf8').split('\n').slice(1);
    recordedButtons = lines.map((l) => l.split(',')[1] || '').filter(Boolean);
  }

  const coveredButtons = [];
  const uncoveredButtons = [];

  for (const b of allButtons) {
    const isCovered =
      recordedButtons.some((rb) => rb.toLowerCase().includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(rb.toLowerCase())) ||
      fullCorpus.includes(b.name) ||
      fullCorpus.includes(`button:has-text("${b.name}")`) ||
      fullCorpus.includes(`[data-testid="${b.name}"]`);

    if (isCovered) {
      coveredButtons.push(b);
    } else {
      uncoveredButtons.push(b);
    }
  }

  return {
    routes: {
      total: allRoutes.length,
      covered: coveredRoutes.length,
      uncovered: uncoveredRoutes.length,
      uncoveredList: uncoveredRoutes.map((r) => r.endpoint),
      all: allRoutes,
    },
    pages: {
      total: allPages.length,
      covered: coveredPages.length,
      uncovered: uncoveredPages.length,
      uncoveredList: uncoveredPages.map((p) => p.name),
      all: allPages,
    },
    buttons: {
      total: allButtons.length,
      covered: coveredButtons.length,
      uncovered: uncoveredButtons.length,
      uncoveredList: uncoveredButtons.slice(0, 30).map((b) => `${b.name} (${b.file}:${b.line})`),
      all: allButtons,
    },
  };
}

module.exports = {
  scanControllerRoutes,
  scanPages,
  scanButtons,
  getCoverageMetrics,
};
