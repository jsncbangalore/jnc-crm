const fs = require('fs');
const path = require('path');

const publicMarketingFiles = [
  'apps/web/src/pages/LandingPage.tsx',
  'apps/web/src/pages/FeaturesPage.tsx',
  'apps/web/src/pages/SolutionsPage.tsx',
  'apps/web/src/pages/PricingPage.tsx',
  'apps/web/src/pages/HelpPage.tsx',
  'apps/web/src/pages/PrivacyPage.tsx',
  'apps/web/src/pages/TermsPage.tsx',
  'apps/web/src/pages/PublicInquiryPage.tsx',
  'apps/web/src/components/quotations/CreateQuotationModal.tsx',
  'scripts/build-marketing-site.js',
];

const bannedWords = ['SSO', 'SAML', 'BOM', 'tier', 'regional', 'GST-compliant'];

console.log('=== TEST: BANNED MARKETING WORDS AUDIT ===\n');
console.log(`Checking files against banned terms: ${bannedWords.join(', ')}...`);

let violations = [];

for (const relPath of publicMarketingFiles) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[WARN] File not found: ${relPath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineIdx) => {
    // Ignore internal code comments or imports
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      return;
    }

    for (const term of bannedWords) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(line)) {
        violations.push({
          file: relPath,
          line: lineIdx + 1,
          term,
          snippet: trimmed,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`\n❌ FAILED: Found ${violations.length} banned word violations:\n`);
  violations.forEach((v) => {
    console.error(`  - [${v.term}] in ${v.file}:${v.line}`);
    console.error(`    "${v.snippet}"\n`);
  });
  process.exit(1);
}

console.log(`\n✅ ALL CHECKS PASSED: 0 banned words found across all ${publicMarketingFiles.length} public marketing files.`);
process.exit(0);
