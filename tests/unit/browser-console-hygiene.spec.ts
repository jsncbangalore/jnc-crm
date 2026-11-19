import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Browser Console Hygiene, Fonts & Rate Limit Fairness Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const distDir = path.join(rootDir, 'apps/web/dist');

  describe('1. Font Assets & Open Font Licensing', () => {
    it('should have Plus Jakarta Sans variable woff2 fonts and OFL license on disk', () => {
      const regularFont = path.join(rootDir, 'apps/web/public/fonts/plus-jakarta-sans-latin-variable.woff2');
      const italicFont = path.join(rootDir, 'apps/web/public/fonts/plus-jakarta-sans-latin-variable-italic.woff2');
      const oflTxt = path.join(rootDir, 'apps/web/public/fonts/OFL.txt');

      expect(fs.existsSync(regularFont)).toBe(true);
      expect(fs.existsSync(italicFont)).toBe(true);
      expect(fs.existsSync(oflTxt)).toBe(true);

      const buf = fs.readFileSync(regularFont);
      expect(buf.toString('utf8', 0, 4)).toBe('wOF2');
      expect(buf.toString('utf8', 0, 4)).not.toBe('<!do');
    });

    it('should not contain unlicenced Nuvetra or Naratama font references', () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, 'apps/web/src/styles/globals.css'), 'utf8');
      const tailwindConfig = fs.readFileSync(path.join(rootDir, 'apps/web/tailwind.config.js'), 'utf8');

      expect(globalsCss).not.toContain('Nuvetra');
      expect(globalsCss).not.toContain('Naratama');
      expect(tailwindConfig).not.toContain('Nuvetra');
      expect(tailwindConfig).not.toContain('Naratama');
    });

    it('should ensure all CSS url() declarations point to existing files in dist', () => {
      const distAssets = path.join(distDir, 'assets');
      if (fs.existsSync(distAssets)) {
        const cssFiles = fs.readdirSync(distAssets).filter(f => f.endsWith('.css'));
        for (const f of cssFiles) {
          const content = fs.readFileSync(path.join(distAssets, f), 'utf8');
          const matches = [...content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)];
          for (const m of matches) {
            const urlPath = m[1];
            if (urlPath.startsWith('http') || urlPath.startsWith('data:')) continue;
            const diskPath = path.join(distDir, urlPath.replace(/^\//, ''));
            expect(fs.existsSync(diskPath)).toBe(true);
          }
        }
      }
    });
  });

  describe('2. .htaccess Single-Page Application Fallback Rules', () => {
    it('should restrict SPA rewrite fallback strictly to extensionless paths', () => {
      const template = fs.readFileSync(path.join(rootDir, 'apps/web/public/.htaccess.template'), 'utf8');
      const publicHtaccess = fs.readFileSync(path.join(rootDir, 'apps/web/public/.htaccess'), 'utf8');

      const expectedCondition = 'RewriteCond %{REQUEST_URI} !\\.[a-zA-Z0-9]{1,8}$';
      expect(template).toContain(expectedCondition);
      expect(publicHtaccess).toContain(expectedCondition);
    });
  });

  describe('3. Rate Limit Fairness & 429 Retry-After Handling', () => {
    it('should exempt 5xx server errors from throttler hit count in DualKeyThrottlerGuard', () => {
      const guardSrc = fs.readFileSync(path.join(rootDir, 'apps/api/src/common/dual-key-throttler.guard.ts'), 'utf8');
      expect(guardSrc).toContain('res.statusCode >= 500');
      expect(guardSrc).toContain('currentHits - 1');
      expect(guardSrc).toContain("res.header('Retry-After'");
    });

    it('should produce standard 429 response shape with Retry-After in HttpExceptionFilter', () => {
      const filterSrc = fs.readFileSync(path.join(rootDir, 'apps/api/src/common/http-exception.filter.ts'), 'utf8');
      expect(filterSrc).toContain("code = 'TOO_MANY_REQUESTS'");
      expect(filterSrc).toContain('Too many attempts. Try again in');
      expect(filterSrc).toContain("response.setHeader('Retry-After'");
      expect(filterSrc).toContain('retryAfter: parseInt(');
    });

    it('should have countdown timer and disable submit button on 429 in AuthLoginForm', () => {
      const formSrc = fs.readFileSync(path.join(rootDir, 'apps/web/src/components/auth/AuthLoginForm.tsx'), 'utf8');
      expect(formSrc).toContain('retryAfterSeconds');
      expect(formSrc).toContain('formatCountdown');
      expect(formSrc).toContain('retryAfterSeconds > 0');
      expect(formSrc).toContain('Try again in {formatCountdown(retryAfterSeconds)}');
    });
  });

  describe('4. Quiet Console on Anonymous /login', () => {
    it('should check hasSessionIndicator before calling refresh or logout', () => {
      const apiSrc = fs.readFileSync(path.join(rootDir, 'apps/web/src/services/api.ts'), 'utf8');
      const authCtx = fs.readFileSync(path.join(rootDir, 'apps/web/src/contexts/AuthContext.tsx'), 'utf8');

      expect(apiSrc).toContain('export const hasSessionIndicator');
      expect(apiSrc).toContain('if (!hasSessionIndicator(isPlatform))');
      expect(apiSrc).toContain('if (!hadSession)');
      expect(authCtx).toContain('if (!hasSessionIndicator(false))');
      expect(authCtx).toContain('if (!hasSessionIndicator(true))');
    });
  });
});
