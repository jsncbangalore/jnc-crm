/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(REPO_ROOT, 'apps/api');
const TARGET_REPO = path.join(process.env.TEMP || '.', 'backend_repo');
const REMOTE_URL = process.env.BACKEND_GIT_REMOTE || '';

function run(cmd, cwd = TARGET_REPO) {
  console.log(`> (${path.basename(cwd)}) ${cmd}`);
  const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (out && out.trim()) console.log(out.trim());
  return out ? out.trim() : '';
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

try {
  console.log('========================================================================');
  console.log('CRM STANDALONE BACKEND SYNC & PUSH (node scripts/push-backend.js)');
  console.log(`Target Repo: ${TARGET_REPO}`);
  console.log(`Remote: ${REMOTE_URL}`);
  console.log('========================================================================\n');

  // 1. Ensure target repo exists
  if (!fs.existsSync(path.join(TARGET_REPO, '.git'))) {
    console.log('[1/4] Cloning backend repo to temp directory...');
    if (fs.existsSync(TARGET_REPO)) {
      fs.rmSync(TARGET_REPO, { recursive: true, force: true });
    }
    execSync(`git clone ${REMOTE_URL} "${TARGET_REPO}"`, { stdio: 'inherit' });
  } else {
    console.log('[1/4] Pulling latest changes from remote...');
    run('git reset --hard HEAD');
    run('git clean -fd');
    run('git fetch origin main');
    run('git checkout main');
    run('git pull origin main --rebase');
  }

  // 2. Synchronize dist, prisma, assets, and start_server.js
  console.log('\n[2/4] Synchronizing build artifacts...');

  // Sync dist
  const targetDist = path.join(TARGET_REPO, 'dist');
  if (fs.existsSync(targetDist)) fs.rmSync(targetDist, { recursive: true, force: true });
  copyRecursiveSync(path.join(API_DIR, 'dist'), targetDist);

  // Sync prisma
  const targetPrisma = path.join(TARGET_REPO, 'prisma');
  if (!fs.existsSync(targetPrisma)) fs.mkdirSync(targetPrisma, { recursive: true });
  fs.copyFileSync(path.join(API_DIR, 'prisma/schema.prisma'), path.join(targetPrisma, 'schema.prisma'));

  // Sync assets if exists
  const apiAssets = path.join(API_DIR, 'assets');
  if (fs.existsSync(apiAssets)) {
    const targetAssets = path.join(TARGET_REPO, 'assets');
    if (fs.existsSync(targetAssets)) fs.rmSync(targetAssets, { recursive: true, force: true });
    copyRecursiveSync(apiAssets, targetAssets);
  }

  // Sync start_server.js
  fs.copyFileSync(path.join(API_DIR, 'start_server.js'), path.join(TARGET_REPO, 'start_server.js'));

  // Generate standalone package.json
  const apiPkg = JSON.parse(fs.readFileSync(path.join(API_DIR, 'package.json'), 'utf8'));
  const standalonePkg = {
    name: 'crm-api',
    version: '1.0.0',
    private: true,
    description: 'CRM API - Standalone Hostinger Web App Deployment Bundle',
    scripts: {
      start: 'node start_server.js',
      postinstall: 'prisma generate',
    },
    dependencies: {
      ...apiPkg.dependencies,
      express: apiPkg.dependencies.express || '^4.22.1',
      '@prisma/client': '^5.22.0',
      prisma: '^5.22.0',
    },
  };
  fs.writeFileSync(
    path.join(TARGET_REPO, 'package.json'),
    JSON.stringify(standalonePkg, null, 2) + '\n',
    'utf8'
  );

  console.log(' -> dist/, prisma/, package.json, start_server.js synchronized successfully.');

  // 3. Check for git diff
  console.log('\n[3/4] Checking git status in target repository...');
  const status = run('git status --porcelain');
  if (!status) {
    console.log('No changes detected; backend repo is already up to date.');
  } else {
    console.log('Detected changes:');
    console.log(status);

    console.log('\n[4/4] Staging, committing, and pushing to remote main...');
    run('git add -A');
    const commitMsg = process.argv[2] || 'feat(webhooks): website form settings, dynamic branding, products catalog, and iframe embed support';
    run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
    run('git push origin main');
    console.log(`\n[SUCCESS] Successfully pushed backend changes to ${REMOTE_URL} (branch main)`);
  }
} catch (err) {
  console.error('\n[FATAL ERROR] Backend sync & push failed:', err.message);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}
