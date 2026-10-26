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
const REMOTE_URL = process.env.BACKEND_GIT_REMOTE || 'https://github.com/jsncbangalore/jnc_crm_backend.git';

function run(cmd, cwd = TARGET_REPO) {
  console.log(`> (${path.basename(cwd)}) ${cmd}`);
  const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (out && out.trim()) console.log(out.trim());
  return out ? out.trim() : '';
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) return;
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
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

  // 2. Synchronize full source code, prisma, config, and build artifacts
  console.log('\n[2/4] Synchronizing backend source code & build artifacts...');

  // Sync src/
  const targetSrc = path.join(TARGET_REPO, 'src');
  if (fs.existsSync(targetSrc)) fs.rmSync(targetSrc, { recursive: true, force: true });
  copyRecursiveSync(path.join(API_DIR, 'src'), targetSrc);
  console.log(' -> src/ source code synchronized');

  // Sync dist/
  const targetDist = path.join(TARGET_REPO, 'dist');
  if (fs.existsSync(targetDist)) fs.rmSync(targetDist, { recursive: true, force: true });
  copyRecursiveSync(path.join(API_DIR, 'dist'), targetDist);
  console.log(' -> dist/ production build synchronized');

  // Sync prisma/
  const targetPrisma = path.join(TARGET_REPO, 'prisma');
  if (fs.existsSync(targetPrisma)) fs.rmSync(targetPrisma, { recursive: true, force: true });
  copyRecursiveSync(path.join(API_DIR, 'prisma'), targetPrisma);
  console.log(' -> prisma/ schemas & migrations synchronized');

  // Sync assets/ if exists
  const apiAssets = path.join(API_DIR, 'assets');
  if (fs.existsSync(apiAssets)) {
    const targetAssets = path.join(TARGET_REPO, 'assets');
    if (fs.existsSync(targetAssets)) fs.rmSync(targetAssets, { recursive: true, force: true });
    copyRecursiveSync(apiAssets, targetAssets);
    console.log(' -> assets/ synchronized');
  }

  // Sync tsconfig and nest-cli
  fs.copyFileSync(path.join(API_DIR, 'tsconfig.json'), path.join(TARGET_REPO, 'tsconfig.json'));
  fs.copyFileSync(path.join(API_DIR, 'nest-cli.json'), path.join(TARGET_REPO, 'nest-cli.json'));
  fs.copyFileSync(path.join(API_DIR, 'start_server.js'), path.join(TARGET_REPO, 'start_server.js'));

  if (fs.existsSync(path.join(API_DIR, 'create_user.js'))) {
    fs.copyFileSync(path.join(API_DIR, 'create_user.js'), path.join(TARGET_REPO, 'create_user.js'));
  }
  if (fs.existsSync(path.join(API_DIR, '.env.example'))) {
    fs.copyFileSync(path.join(API_DIR, '.env.example'), path.join(TARGET_REPO, '.env.example'));
  }

  // Sync .gitignore
  const gitignoreContent = `node_modules/
dist/
.env
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
data/
uploads/
backups/
`;
  // Allow dist in standalone repo for Hostinger 1-click execution if needed
  fs.writeFileSync(path.join(TARGET_REPO, '.gitignore'), `node_modules/\n.env\n*.log\n.DS_Store\ndata/\nuploads/\nbackups/\n`, 'utf8');

  // Generate standalone package.json
  const apiPkg = JSON.parse(fs.readFileSync(path.join(API_DIR, 'package.json'), 'utf8'));
  const standalonePkg = {
    name: 'crm-backend',
    version: '1.0.0',
    private: true,
    description: 'CRM Backend API - NestJS, Prisma & PostgreSQL',
    scripts: {
      build: 'nest build',
      start: 'node start_server.js',
      'start:dev': 'nest start --watch',
      'start:prod': 'node dist/main.js',
      'prisma:generate': 'prisma generate',
      'prisma:migrate': 'prisma migrate dev',
      'prisma:db-push': 'prisma db push',
      postinstall: 'prisma generate',
    },
    dependencies: {
      ...apiPkg.dependencies,
      express: apiPkg.dependencies.express || '^4.22.1',
      '@prisma/client': '^5.22.0',
      prisma: '^5.22.0',
    },
    devDependencies: {
      '@nestjs/cli': '^10.3.2',
      '@nestjs/schematics': '^10.1.0',
      '@nestjs/testing': '^10.3.3',
      '@types/express': '^4.17.21',
      '@types/node': '^20.11.24',
      'ts-node': '^10.9.2',
      typescript: '^5.3.3',
    },
  };
  fs.writeFileSync(
    path.join(TARGET_REPO, 'package.json'),
    JSON.stringify(standalonePkg, null, 2) + '\n',
    'utf8'
  );

  // Standalone README.md
  const readmeContent = `# CRM Backend API

Production NestJS API backend with PostgreSQL and Prisma ORM.

## Features
- **Authentication**: JWT access/refresh token rotation, 2FA (TOTP/Email), Role-Based Access Control (RBAC).
- **Core Modules**: Leads, Quotations, Orders, Invoicing (with PDF generation), Inventory, Suppliers, Purchase Bills, Automation workflows.
- **Enterprise Ready**: White-label multi-tenancy, rate limiting, Helmet security headers, audit logs.

## Setup & Running Locally

1. **Install dependencies**:
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure Environment**:
   Copy \`.env.example\` to \`.env\` and fill in database credentials and secrets:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. **Generate Prisma Client & Migrate DB**:
   \`\`\`bash
   npm run prisma:generate
   npm run prisma:db-push
   \`\`\`

4. **Start Development Server**:
   \`\`\`bash
   npm run start:dev
   \`\`\`
   The API will listen at \`http://localhost:3333/api/v1\`.

## Production Deployment (Hostinger / Node.js)
\`\`\`bash
npm start
\`\`\`
*(Runs \`node start_server.js\` on the configured PORT or default 3333).*
`;

  fs.writeFileSync(path.join(TARGET_REPO, 'README.md'), readmeContent, 'utf8');
  console.log(' -> package.json & README.md generated');

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
    const commitMsg = process.argv[2] || 'feat(backend): complete nestjs backend source code, prisma schema, build artifacts, and standalone setup';
    run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
    run('git push origin main');
    console.log(`\n[SUCCESS] Successfully pushed backend code to ${REMOTE_URL} (branch main)`);
  }
} catch (err) {
  console.error('\n[FATAL ERROR] Backend sync & push failed:', err.message);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}
