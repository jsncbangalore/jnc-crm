/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { validateUploadedFile } from '../../apps/api/src/common/file-validator';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorageService } from '../../apps/api/src/common/storage/storage.service';

describe('Security Hygiene, Uploads Protection & Clean Repository Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');

  // ─── 1. Source & Build Default Passwords Audit ───────────────────────────────
  it('1. Verifies API source and Web source contain zero hardcoded DevAccountsBox or default seed passwords', () => {
    // A. Check that DevAccountsBox is completely removed from web source
    const devAccountsBoxPath = path.join(rootDir, 'apps/web/src/components/auth/DevAccountsBox.tsx');
    expect(fs.existsSync(devAccountsBoxPath)).toBe(false);

    // B. Check AuthLoginForm.tsx does not import DevAccountsBox
    const authLoginForm = fs.readFileSync(path.join(rootDir, 'apps/web/src/components/auth/AuthLoginForm.tsx'), 'utf8');
    expect(authLoginForm).not.toContain('DevAccountsBox');

    // C. Check that deploy/app-role-hardening.sql does not contain CHANGE_IN_PRODUCTION
    const deploySql = fs.readFileSync(path.join(rootDir, 'deploy/app-role-hardening.sql'), 'utf8');
    expect(deploySql).not.toContain('CHANGE_IN_PRODUCTION_STRONG_PASSWORD');
  });

  // ─── 2. Deploy SQL Guard ───────────────────────────────────────────────────
  it('2. Verifies deploy SQL enforces psql variable presence and refuses execution without app_role_password', () => {
    const deploySqlPath = path.join(rootDir, 'deploy/app-role-hardening.sql');
    expect(fs.existsSync(deploySqlPath)).toBe(true);
    const content = fs.readFileSync(deploySqlPath, 'utf8');

    // Must check variable presence with \if :{?app_role_password}
    expect(content).toContain('\\if :{?app_role_password}');
    expect(content).toContain('\\q 1');
    expect(content).toContain("PASSWORD :'app_role_password'");
  });

  // ─── 3. Upload File Validation (Purchase Documents) ─────────────────────────
  it('3. Refuses upload of HTML, SVG, EXE, and renamed PDF-to-PNG; accepts genuine PDF and PNG', () => {
    // Refuse HTML
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'malicious.html',
          buffer: Buffer.from('<html><body>exploit</body></html>'),
        } as any,
        'purchase_document',
      );
    }).toThrow(BadRequestException);

    // Refuse SVG
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'malicious.svg',
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        } as any,
        'purchase_document',
      );
    }).toThrow(BadRequestException);

    // Refuse EXE
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'payload.exe',
          buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00'),
        } as any,
        'purchase_document',
      );
    }).toThrow(BadRequestException);

    // Refuse PDF disguised as PNG (magic bytes mismatch)
    const fakePngPdf = Buffer.from('%PDF-1.4 Fake PDF Content');
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'fake.png',
          buffer: fakePngPdf,
        } as any,
        'purchase_document',
      );
    }).toThrow(BadRequestException);

    // Accept genuine PDF
    const validPdf = Buffer.from('%PDF-1.7 %Valid Purchase Bill Buffer Content');
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'valid_bill.pdf',
          buffer: validPdf,
        } as any,
        'purchase_document',
      );
    }).not.toThrow();

    // Accept genuine PNG
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(() => {
      validateUploadedFile(
        {
          originalname: 'valid_bill.png',
          buffer: validPng,
        } as any,
        'purchase_document',
      );
    }).not.toThrow();
  });

  // ─── 4. Document Download Safety & Path Traversal ───────────────────────────
  it('4. Rejects path traversal attempts and missing files on document retrieval', async () => {
    const storageService = new StorageService();

    // Traversal rejection
    await expect(storageService.getPurchaseDocumentStream('tenant-1', '../../../etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
    await expect(storageService.getPurchaseDocumentStream('..', 'valid.pdf')).rejects.toThrow(
      BadRequestException,
    );
    await expect(storageService.getPurchaseDocumentStream('tenant-1', '..\\secret.pdf')).rejects.toThrow(
      BadRequestException,
    );

    // 404 for missing document
    await expect(
      storageService.getPurchaseDocumentStream('tenant-nonexistent-1234', 'nonexistent_file_987654.pdf'),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── 5. Production Dist & Public Directory Cleanliness ──────────────────────
  it('5. Verifies branding upload files are NOT in apps/web/public or build dist', () => {
    const publicUploads = path.join(rootDir, 'apps/web/public/uploads');
    expect(fs.existsSync(publicUploads)).toBe(false);

    const apiNestedPublic = path.join(rootDir, 'apps/api/apps/web');
    expect(fs.existsSync(apiNestedPublic)).toBe(false);
  });

  // ─── 6. Database BrandingAsset & PDF Generation ─────────────────────────────
  it('6. Verifies PDF generator prioritizes logoBuffer from BrandingAsset table', async () => {
    const pdfGenPath = path.join(rootDir, 'apps/api/src/invoicing/pdf-generator.ts');
    const pdfGenCode = fs.readFileSync(pdfGenPath, 'utf8');

    // Verify resolvedLogo takes logoBuffer directly from company profile (BrandingAsset)
    expect(pdfGenCode).toContain('let resolvedLogo: any = (profile as any)?.logoBuffer || null;');
    // Verify fallback does NOT include apps/web/public/uploads/branding
    expect(pdfGenCode).not.toContain("'apps/web/public/uploads/branding'");
  });

  // ─── 7. Git Tracked Files Audit ─────────────────────────────────────────────
  it('7. Verifies git tracked files contain zero secrets, dumps, zips, or backups', () => {
    const output = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' });
    const trackedFiles = output.split('\n').map((l) => l.trim()).filter(Boolean);

    // No .env files except .env.development.example
    const envFiles = trackedFiles.filter(
      (f) => (f === '.env' || f.startsWith('.env.')) && f !== '.env.development.example',
    );
    expect(envFiles).toEqual([]);

    // No zip files tracked
    const zipFiles = trackedFiles.filter((f) => f.endsWith('.zip'));
    expect(zipFiles).toEqual([]);

    // No sql dump files (only migrations and deploy scripts allowed)
    const illegalSql = trackedFiles.filter(
      (f) =>
        f.endsWith('.sql') &&
        !f.startsWith('apps/api/prisma/migrations/') &&
        !f.startsWith('apps/api/prisma/migration_plans/') &&
        !f.startsWith('deploy/') &&
        !f.startsWith('docs/deferred-migrations/'),
    );
    expect(illegalSql).toEqual([]);

    // No backups directory tracked
    const backupFiles = trackedFiles.filter((f) => f.startsWith('backups/'));
    expect(backupFiles).toEqual([]);

    // No .dev-passwords.json tracked
    const devPassFiles = trackedFiles.filter((f) => f.includes('.dev-passwords.json'));
    expect(devPassFiles).toEqual([]);
  });
});
