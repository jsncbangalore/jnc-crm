const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.resolve(ROOT, 'apps/web/public/.htaccess.template');
const TARGET_PUBLIC = path.resolve(ROOT, 'apps/web/public/.htaccess');
const TARGET_DIST = path.resolve(ROOT, 'apps/web/dist/.htaccess');

function resolveApiOrigin() {
  const envUrl = process.env.VITE_API_BASE_URL || process.env.API_ORIGIN || process.env.VITE_API_URL || '';
  if (!envUrl || envUrl.startsWith('/')) {
    return 'https:';
  }
  try {
    const parsed = new URL(envUrl);
    return `${parsed.origin} https:`;
  } catch {
    return 'https:';
  }
}

function generateHtaccess() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`[ERROR] .htaccess.template not found at ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  const rawTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const apiOrigin = resolveApiOrigin();

  // Replace {{API_ORIGIN}} cleanly with allowed origins including https:
  const rendered = rawTemplate.replace(
    /connect-src 'self' \{\{API_ORIGIN\}\};/g,
    `connect-src 'self' ${apiOrigin};`
  );

  fs.writeFileSync(TARGET_PUBLIC, rendered, 'utf8');
  console.log(`[OK] Generated apps/web/public/.htaccess (API Origin: "${apiOrigin}")`);

  if (fs.existsSync(path.dirname(TARGET_DIST))) {
    fs.writeFileSync(TARGET_DIST, rendered, 'utf8');
    console.log(`[OK] Updated apps/web/dist/.htaccess`);
  }
}

generateHtaccess();
