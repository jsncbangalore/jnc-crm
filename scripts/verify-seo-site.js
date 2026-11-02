const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MARKETING_DIR = path.resolve(ROOT_DIR, 'marketing-site');
const CONFIG_PATH = path.resolve(MARKETING_DIR, 'site.config.json');

console.log('[VERIFY-SEO] Starting Static Marketing Site and App SEO validation...');

const errors = [];

if (!fs.existsSync(CONFIG_PATH)) {
  errors.push(`Missing site.config.json at ${CONFIG_PATH}`);
}

const requiredPages = [
  { file: 'index.html', canonical: '/' },
  { file: 'features.html', canonical: '/features.html' },
  { file: 'pricing.html', canonical: '/pricing.html' },
  { file: 'contact.html', canonical: '/contact.html' },
  { file: 'privacy.html', canonical: '/privacy.html' },
  { file: 'terms.html', canonical: '/terms.html' },
];

const titles = new Map();
const descriptions = new Map();

for (const reqPage of requiredPages) {
  const filePath = path.resolve(MARKETING_DIR, reqPage.file);
  if (!fs.existsSync(filePath)) {
    errors.push(`Required marketing page missing: ${reqPage.file}`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // 1. Title validation: strictly <= 60 characters and non-empty
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push(`${reqPage.file}: Missing or empty <title> tag`);
  } else {
    const title = titleMatch[1].trim();
    if (title.length > 60) {
      errors.push(`${reqPage.file}: Title exceeds 60 characters (${title.length} chars): "${title}"`);
    }
    if (titles.has(title)) {
      errors.push(`${reqPage.file}: Duplicate title "${title}" also used in ${titles.get(title)}`);
    } else {
      titles.set(title, reqPage.file);
    }
  }

  // 2. Meta description validation: strictly <= 155 characters and non-empty
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  if (!descMatch || !descMatch[1].trim()) {
    errors.push(`${reqPage.file}: Missing or empty <meta name="description"> tag`);
  } else {
    const desc = descMatch[1].trim();
    if (desc.length > 155) {
      errors.push(`${reqPage.file}: Description exceeds 155 characters (${desc.length} chars): "${desc}"`);
    }
    if (descriptions.has(desc)) {
      errors.push(`${reqPage.file}: Duplicate description also used in ${descriptions.get(desc)}`);
    } else {
      descriptions.set(desc, reqPage.file);
    }
  }

  // 3. Exactly one <h1> tag
  const h1Matches = content.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
  if (h1Matches.length !== 1) {
    errors.push(`${reqPage.file}: Must have exactly one <h1> tag, found ${h1Matches.length}`);
  }

  // 4. Canonical link validation
  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  if (!canonicalMatch || !canonicalMatch[1].trim()) {
    errors.push(`${reqPage.file}: Missing <link rel="canonical"> tag`);
  } else {
    const href = canonicalMatch[1].trim();
    if (!href.endsWith(reqPage.canonical) && !(reqPage.canonical === '/' && !href.endsWith('.html'))) {
      errors.push(`${reqPage.file}: Canonical URL mismatch: expected ending "${reqPage.canonical}", got "${href}"`);
    }
  }

  // 5. Open Graph tags
  const requiredOg = ['og:type', 'og:url', 'og:title', 'og:description', 'og:image'];
  for (const og of requiredOg) {
    const ogRegex = new RegExp(`<meta\\s+property=["']${og}["']\\s+content=["']([^"']+)["']`, 'i');
    if (!ogRegex.test(content)) {
      errors.push(`${reqPage.file}: Missing required Open Graph tag: ${og}`);
    }
  }

  // 6. Twitter card tags
  const requiredTwitter = ['twitter:card', 'twitter:url', 'twitter:title', 'twitter:description', 'twitter:image'];
  for (const tw of requiredTwitter) {
    const twRegex = new RegExp(`<meta\\s+name=["']${tw}["']\\s+content=["']([^"']+)["']`, 'i');
    if (!twRegex.test(content)) {
      errors.push(`${reqPage.file}: Missing required Twitter tag: ${tw}`);
    }
  }

  // 7. Image alt text check
  const imgMatches = content.match(/<img[^>]*>/gi) || [];
  for (const img of imgMatches) {
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    if (!altMatch || !altMatch[1].trim()) {
      errors.push(`${reqPage.file}: <img> tag missing non-empty alt text: ${img}`);
    }
  }

  // 8. Structured data JSON-LD validation
  const jsonLdMatches = content.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi) || [];
  if (jsonLdMatches.length === 0) {
    errors.push(`${reqPage.file}: Missing structured data JSON-LD`);
  } else {
    let hasOrg = false;
    let hasSoftwareApp = false;

    for (const match of jsonLdMatches) {
      const jsonStr = match.replace(/<\/?script[^>]*>/gi, '').trim();
      try {
        const parsed = JSON.parse(jsonStr);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item['@type'] === 'Organization') hasOrg = true;
          if (item['@type'] === 'SoftwareApplication') hasSoftwareApp = true;

          // Check for forbidden claims in structured data
          const serialized = JSON.stringify(item).toLowerCase();
          if (serialized.includes('aggregaterating') || serialized.includes('ratingvalue') || serialized.includes('reviewcount')) {
            errors.push(`${reqPage.file}: Structured data contains forbidden rating/review claims`);
          }
        }
      } catch (e) {
        errors.push(`${reqPage.file}: Invalid JSON in ld+json block: ${e.message}`);
      }
    }

    if (!hasOrg || !hasSoftwareApp) {
      errors.push(`${reqPage.file}: Structured data must contain Organization and SoftwareApplication entities`);
    }
  }

  // 9. Check copy for forbidden claims or invented stats
  const forbiddenPhrases = [
    '#1 rated',
    'world\'s best',
    '99.999% satisfaction',
    '5-star rating',
    'loved by millions',
    'invented statistic'
  ];
  const lowerContent = content.toLowerCase();
  for (const phrase of forbiddenPhrases) {
    if (lowerContent.includes(phrase)) {
      errors.push(`${reqPage.file}: Contains forbidden hype/rating phrase: "${phrase}"`);
    }
  }
}

// 10. Check sitemap.xml
const sitemapPath = path.resolve(MARKETING_DIR, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  errors.push('Missing sitemap.xml in marketing-site');
} else {
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemapContent.includes('<urlset') || !sitemapContent.includes('</urlset>')) {
    errors.push('sitemap.xml is not valid XML sitemap');
  }
  for (const p of requiredPages) {
    if (!sitemapContent.includes(p.canonical === '/' ? 'https://example.com/' : p.canonical)) {
      errors.push(`sitemap.xml missing entry for ${p.file}`);
    }
  }
}

// 11. Check robots.txt
const robotsPath = path.resolve(MARKETING_DIR, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  errors.push('Missing robots.txt in marketing-site');
} else {
  const robotsContent = fs.readFileSync(robotsPath, 'utf8');
  if (!robotsContent.includes('User-agent: *') || !robotsContent.includes('Allow: /')) {
    errors.push('robots.txt must allow indexing for marketing site (User-agent: * Allow: /)');
  }
}

// 12. Check App noindex enforcement
const webIndexPath = path.resolve(ROOT_DIR, 'apps/web/index.html');
if (fs.existsSync(webIndexPath)) {
  const webIndexContent = fs.readFileSync(webIndexPath, 'utf8');
  if (!webIndexContent.includes('<meta name="robots" content="noindex, nofollow"')) {
    errors.push('apps/web/index.html is missing <meta name="robots" content="noindex, nofollow" />');
  }
} else {
  errors.push('apps/web/index.html not found');
}

// 13. Check that /landing route is removed from apps/web/src/App.tsx
const appTsxPath = path.resolve(ROOT_DIR, 'apps/web/src/App.tsx');
if (fs.existsSync(appTsxPath)) {
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
  if (appTsxContent.includes('<Route path="/landing" element={<LandingPage />} />')) {
    errors.push('apps/web/src/App.tsx still contains <Route path="/landing" element={<LandingPage />} />');
  }
}

if (errors.length > 0) {
  console.error(`[VERIFY-SEO] FAILED with ${errors.length} error(s):`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`[VERIFY-SEO] PASSED! All ${requiredPages.length} marketing pages, sitemap.xml, robots.txt, and app noindex rules verified successfully.`);
