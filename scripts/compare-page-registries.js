const fs = require('fs');
const ts = require('typescript');

function loadModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', transpiled.outputText);
  fn(m, m.exports, require);
  return m.exports;
}

const webReg = loadModule('apps/web/src/config/page-registry.ts');
const apiReg = loadModule('apps/api/src/auth/page-registry.ts');

console.log('========================================================================');
console.log('STEP 2: PAGE REGISTRY COMPARISON (Web vs API)');
console.log('========================================================================\n');

// 1. Company Page Keys
const webCompanyKeys = Object.keys(webReg.COMPANY_PAGE_REGISTRY || {});
const apiCompanyKeys = Object.keys(apiReg.COMPANY_PAGE_REGISTRY || {});

console.log('1. COMPANY PAGE KEYS:');
console.log('   Web Company Page Keys count:', webCompanyKeys.length);
console.log('   API Company Page Keys count:', apiCompanyKeys.length);

const keysOnlyInWeb = webCompanyKeys.filter(k => !apiCompanyKeys.includes(k));
const keysOnlyInApi = apiCompanyKeys.filter(k => !webCompanyKeys.includes(k));
console.log('   Keys only in Web:', keysOnlyInWeb.length > 0 ? keysOnlyInWeb : 'None');
console.log('   Keys only in API:', keysOnlyInApi.length > 0 ? keysOnlyInApi : 'None');

// 2. Per-Key Differences
console.log('\n2. FIELD-LEVEL DIFFERENCES IN COMPANY_PAGE_REGISTRY:');
let diffCount = 0;
for (const key of webCompanyKeys) {
  if (!apiReg.COMPANY_PAGE_REGISTRY[key]) continue;
  const webItem = webReg.COMPANY_PAGE_REGISTRY[key];
  const apiItem = apiReg.COMPANY_PAGE_REGISTRY[key];

  const diffs = [];
  if (webItem.label !== apiItem.label) {
    diffs.push(`label: Web="${webItem.label}" vs API="${apiItem.label}"`);
  }
  if (webItem.group !== apiItem.group) {
    diffs.push(`group: Web="${webItem.group}" vs API="${apiItem.group}"`);
  }
  const webRoutes = JSON.stringify(webItem.frontendRoutes || []);
  const apiRoutes = JSON.stringify(apiItem.frontendRoutes || []);
  if (webRoutes !== apiRoutes) {
    diffs.push(`frontendRoutes: Web=${webRoutes} vs API=${apiRoutes}`);
  }
  const webControllers = JSON.stringify(webItem.controllers || []);
  const apiControllers = JSON.stringify(apiItem.controllers || []);
  if (webControllers !== apiControllers) {
    diffs.push(`controllers: Web=${webControllers} vs API=${apiControllers}`);
  }
  if (webItem.description !== apiItem.description) {
    diffs.push(`description: Web="${webItem.description}" vs API="${apiItem.description}"`);
  }

  if (diffs.length > 0) {
    diffCount++;
    console.log(`   [Key: ${key}]`);
    diffs.forEach(d => console.log(`     - ${d}`));
  }
}
if (diffCount === 0) {
  console.log('   No field-level differences in shared keys.');
}

// 3. Platform Page Registry
console.log('\n3. PLATFORM PAGE REGISTRY:');
const webPlatKeys = Object.keys(webReg.PLATFORM_PAGE_REGISTRY || {});
const apiPlatKeys = Object.keys(apiReg.PLATFORM_PAGE_REGISTRY || {});
console.log('   Web Platform Keys:', webPlatKeys);
console.log('   API Platform Keys:', apiPlatKeys);

// 4. STANDARD TEMPLATES
console.log('\n4. STANDARD TEMPLATES:');
console.log('   Web STANDARD_TEMPLATES defined:', Boolean(webReg.STANDARD_TEMPLATES));
if (webReg.STANDARD_TEMPLATES) {
  for (const [tplId, tpl] of Object.entries(webReg.STANDARD_TEMPLATES)) {
    console.log(`     - ${tplId}: name="${tpl.name}", pages=${JSON.stringify(tpl.pages)}`);
  }
}
console.log('   API STANDARD_TEMPLATES defined:', Boolean(apiReg.STANDARD_TEMPLATES));
if (apiReg.STANDARD_TEMPLATES) {
  for (const [tplId, tpl] of Object.entries(apiReg.STANDARD_TEMPLATES)) {
    console.log(`     - ${tplId}: name="${tpl.name}", pages=${JSON.stringify(tpl.pages)}`);
  }
} else {
  console.log('     * NOTE: STANDARD_TEMPLATES is MISSING from apps/api/src/auth/page-registry.ts!');
}

// 5. HELPER FUNCTIONS & EXPORTS
console.log('\n5. EXPORTED HELPERS:');
const webExports = Object.keys(webReg).sort();
const apiExports = Object.keys(apiReg).sort();
console.log('   Exports only in Web:', webExports.filter(e => !apiExports.includes(e)));
console.log('   Exports only in API:', apiExports.filter(e => !webExports.includes(e)));
