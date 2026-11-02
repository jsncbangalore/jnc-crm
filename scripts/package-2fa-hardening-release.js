const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const artifactDir = 'C:\\Users\\JNC R&D\\.gemini\\antigravity\\brain\\35af9003-1b6b-4a84-aff8-4a7e38775824';
const stagingDir = path.join(rootDir, 'dist-2fa-hardening');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

const filesToPackage = [
  'apps/api/prisma/migrations/20261030211500_add_2fa_pending_and_phone_verification/migration.sql',
  'apps/api/prisma/schema.prisma',
  'apps/api/src/auth/auth.service.ts',
  'apps/api/src/auth/auth.controller.ts',
  'apps/api/src/prisma/prisma.service.ts',
  'apps/api/src/common/totp.util.ts',
  'apps/web/src/pages/MyAccountPage.tsx',
  'scripts/test-2fa-hardening-suite.js',
  'scripts/test-myaccount-bugs-fixed.js',
];

for (const relPath of filesToPackage) {
  const src = path.join(rootDir, relPath);
  const dest = path.join(stagingDir, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied: ${relPath}`);
}

const zipName = '2fa-mobile-hardening-release.zip';
const rootZipPath = path.join(rootDir, zipName);
const artifactZipPath = path.join(artifactDir, zipName);

if (fs.existsSync(rootZipPath)) fs.unlinkSync(rootZipPath);
if (fs.existsSync(artifactZipPath)) fs.unlinkSync(artifactZipPath);

// Compress staging directory using PowerShell Compress-Archive
console.log('Compressing archive...');
execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${rootZipPath}' -Force"`);
fs.copyFileSync(rootZipPath, artifactZipPath);

console.log(`Zip created successfully:`);
console.log(`  - Root: ${rootZipPath} (${fs.statSync(rootZipPath).size} bytes)`);
console.log(`  - Artifact: ${artifactZipPath} (${fs.statSync(artifactZipPath).size} bytes)`);

// Clean staging directory
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log('Staging directory cleaned up.');
