import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  COMPANY_LEGAL_NAME as WEB_LEGAL,
  COMPANY_SHORT_NAME as WEB_SHORT,
  PRODUCT_NAME as WEB_PRODUCT,
  BRAND as WEB_BRAND,
  getProductName as getWebProductName,
  getProductLogoUrl as getWebProductLogoUrl,
} from '../../apps/web/src/config/brand';
import {
  COMPANY_LEGAL_NAME as API_LEGAL,
  COMPANY_SHORT_NAME as API_SHORT,
  PRODUCT_NAME as API_PRODUCT,
  BRAND as API_BRAND,
  getProductName as getApiProductName,
  getProductLogoUrl as getApiProductLogoUrl,
} from '../../apps/api/src/common/brand';

const ROOT_DIR = path.resolve(__dirname, '../..');
const currentYear = new Date().getFullYear();
const EXPECTED_COPYRIGHT = `© ${currentYear} JNC Network Communication. Syntra CRM. All rights reserved.`;

describe('Step 3: Brand Rules & Immutability Test Suite', () => {
  let prisma: PrismaClient;
  let testTenantId: string | null = null;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    if (testTenantId && prisma) {
      try {
        await prisma.tenant.delete({ where: { id: testTenantId } });
      } catch {}
    }
    await prisma.$disconnect();
  });

  // 1. brand.ts and API twin export exact fixed values
  it('1. brand.ts and the API twin export the exact fixed brand values', () => {
    expect(WEB_LEGAL).toBe('JNC Network Communication');
    expect(API_LEGAL).toBe('JNC Network Communication');

    expect(WEB_SHORT).toBe('JNC');
    expect(API_SHORT).toBe('JNC');

    expect(WEB_PRODUCT).toBe('Syntra CRM');
    expect(API_PRODUCT).toBe('Syntra CRM');

    expect(WEB_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);
    expect(API_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);
  });

  // 2. Setting tenant company name or logo does not change product branding
  it('2. Tenant custom branding does not change product name, logo or copyright text', async () => {
    const code = `TEST_${Date.now().toString().slice(-6)}`;
    const tenant = await prisma.tenant.create({
      data: {
        code,
        name: 'Custom White Label Corp',
        slug: code.toLowerCase(),
        logoUrl: 'https://example.com/custom-logo.png',
      },
    });
    testTenantId = tenant.id;

    try {
      // Calling getProductName and getProductLogoUrl with tenant branding
      expect(getWebProductName({ companyDisplayName: tenant.name })).toBe('Syntra CRM');
      expect(getApiProductName()).toBe('Syntra CRM');

      // Product logo remains fixed static asset
      expect(getWebProductLogoUrl()).toBeTruthy();
      expect(getWebProductLogoUrl()).not.toBe(tenant.logoUrl);
      expect(getApiProductLogoUrl()).toBe('/logo.png');

      // Copyright text remains immutable
      expect(WEB_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);
      expect(API_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);
    } finally {
      await prisma.tenant.delete({ where: { id: tenant.id } });
      testTenantId = null;
    }
  });

  // 3. Setting environment variables does not change product name
  it('3. Setting environment variables does not change product name', () => {
    const originalEnvProd = process.env.PRODUCT_NAME;
    const originalViteProd = process.env.VITE_PRODUCT_NAME;

    try {
      process.env.PRODUCT_NAME = 'Hacked CRM';
      process.env.VITE_PRODUCT_NAME = 'Hacked CRM';

      expect(getWebProductName()).toBe('Syntra CRM');
      expect(getApiProductName()).toBe('Syntra CRM');
      expect(WEB_PRODUCT).toBe('Syntra CRM');
      expect(API_PRODUCT).toBe('Syntra CRM');
    } finally {
      if (originalEnvProd) process.env.PRODUCT_NAME = originalEnvProd;
      else delete process.env.PRODUCT_NAME;
      if (originalViteProd) process.env.VITE_PRODUCT_NAME = originalViteProd;
      else delete process.env.VITE_PRODUCT_NAME;
    }
  });

  // 4. Logo and favicon file hash verification against brand.lock.json
  it('4. Logo and favicon hashes match brand.lock.json and commit note is verified', () => {
    const lockPath = path.join(ROOT_DIR, 'brand.lock.json');
    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

    expect(lock.COMPANY_LEGAL_NAME).toBe('JNC Network Communication');
    expect(lock.COMPANY_SHORT_NAME).toBe('JNC');
    expect(lock.PRODUCT_NAME).toBe('Syntra CRM');
    expect(lock.changeNote).toBe('BRAND CHANGE APPROVED');

    for (const [relPath, expectedHash] of Object.entries(lock.hashes)) {
      const fullPath = path.join(ROOT_DIR, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
  });

  // 5. Repo-wide forbidden brand name scan
  it('5. Repo-wide scan has zero forbidden brand names in src, public, html, emails and dist', () => {
    const forbidden = [
      'JNC CRM',
      'Apex Enterprise',
      'Apex Systems',
      'Apex CRM',
      'JNC Network & Power Solutions',
    ];

    const dirsToScan = [
      'apps/web/src',
      'apps/api/src',
      'apps/web/public',
      'marketing-site',
      'apps/web/dist',
    ];

    function scanDir(dir: string): { file: string; line: number; match: string }[] {
      const hits: { file: string; line: number; match: string }[] = [];
      const fullDir = path.join(ROOT_DIR, dir);
      if (!fs.existsSync(fullDir)) return hits;

      function walk(d: string) {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          if (ent.name === 'node_modules' || ent.name === '.git') continue;
          const p = path.join(d, ent.name);
          if (ent.isDirectory()) {
            walk(p);
          } else if (ent.isFile()) {
            if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.ico') || p.endsWith('.woff2')) continue;
            const content = fs.readFileSync(p, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              for (const f of forbidden) {
                if (line.includes(f)) {
                  hits.push({ file: p, line: i + 1, match: f });
                }
              }
            }
          }
        }
      }
      walk(fullDir);
      return hits;
    }

    let violations: { file: string; line: number; match: string }[] = [];
    for (const d of dirsToScan) {
      violations = violations.concat(scanDir(d));
    }

    expect(violations).toEqual([]);
  });

  // 6. Footer and copyright text verification across all surfaces
  it('6. Footer and copyright text equals the fixed copyright line and landing keeps security text', () => {
    // Web Brand definition
    expect(WEB_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);
    expect(API_BRAND.copyright).toBe(EXPECTED_COPYRIGHT);

    // AuthLayout, Footer, SharedCartPage, PublicInquiryPage
    const footerCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/common/Footer.tsx'), 'utf8');
    expect(footerCode).toContain('{BRAND.copyright}');

    const authLayoutCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/layout/AuthLayout.tsx'), 'utf8');
    expect(authLayoutCode).toContain('{BRAND.copyright}');

    const sharedCartCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/pages/SharedCartPage.tsx'), 'utf8');
    expect(sharedCartCode).toContain('{BRAND.copyright}');

    // Landing page security guarantee text
    const landingCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/pages/LandingPage.tsx'), 'utf8');
    expect(landingCode).toContain('Enterprise-grade security and dedicated support');
  });

  // 7. Page title is Syntra CRM and backup code download filenames start with jnc-
  it('7. Page title resolves to Syntra CRM and backup code downloads start with jnc-', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/dist/index.html'), 'utf8');
    expect(indexHtml).toContain('<title>Syntra CRM</title>');
    expect(indexHtml).toContain('<meta property="og:title" content="Syntra CRM" />');

    // TwoFactorChallenge backup code filename
    const twoFaCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/common/TwoFactorChallenge.tsx'), 'utf8');
    expect(twoFaCode).toContain("a.download = 'jnc-backup-codes.txt'");

    // MyAccountPage backup code filenames
    const myAccountCode = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/pages/MyAccountPage.tsx'), 'utf8');
    const downloadMatches = [...myAccountCode.matchAll(/a\.download\s*=\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
    expect(downloadMatches.length).toBeGreaterThan(0);
    for (const dl of downloadMatches) {
      expect(dl.startsWith('jnc-')).toBe(true);
    }
  });
});
