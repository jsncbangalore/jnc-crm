const fs = require('fs');
const path = require('path');

const publicPages = [
  'apps/web/src/pages/LandingPage.tsx',
  'apps/web/src/pages/FeaturesPage.tsx',
  'apps/web/src/pages/SolutionsPage.tsx',
  'apps/web/src/pages/PricingPage.tsx',
  'apps/web/src/pages/HelpPage.tsx',
  'apps/web/src/pages/PrivacyPage.tsx',
  'apps/web/src/pages/TermsPage.tsx',
];

const banned = ['SSO', 'SAML', 'BOM', 'tier', 'regional', 'GST-compliant'];

console.log('--- SCANNING MARKETING PAGES FOR BANNED WORDS ---');
let foundCount = 0;

for (const p of publicPages) {
  const full = path.resolve(__dirname, '..', p);
  if (!fs.existsSync(full)) {
    console.log('Not found:', p);
    continue;
  }
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const b of banned) {
      const re = new RegExp(`(^|[^a-zA-Z0-9])${b.replace('-', '\\-')}([^a-zA-Z0-9]|$)`, 'i');
      if (re.test(line)) {
        console.log(`${p}:${i + 1} [${b}]: ${line.trim()}`);
        foundCount++;
      }
    }
  });
}

console.log(`Total occurrences found: ${foundCount}`);
