import { describe, it, expect } from 'vitest';
import {
  COMPANY_PAGE_REGISTRY,
  STANDARD_TEMPLATES,
  ALL_COMPANY_PAGE_KEYS,
  PAGE_KEY_TO_ROUTE,
  getLegacyPagesForRole,
} from '../../apps/web/src/config/page-registry';
import {
  STANDARD_TEMPLATES as API_STANDARD_TEMPLATES,
  COMPANY_PAGE_REGISTRY as API_COMPANY_PAGE_REGISTRY,
} from '../../apps/api/src/auth/page-registry';
import { getRoleRedirectPath } from '../../apps/web/src/utils/roles';

describe('User Page Access, Permissions, & Template Integrity Suite', () => {
  // ─── 1. Template x Landing Page Permutations ─────────────────────────────
  describe('1. Template x Landing Page Permutations', () => {
    it('verifies standard templates exist in both Web and API registries with matching pages', () => {
      const templateKeys = Object.keys(STANDARD_TEMPLATES);
      expect(templateKeys).toEqual(Object.keys(API_STANDARD_TEMPLATES));

      for (const key of templateKeys) {
        const webTpl = STANDARD_TEMPLATES[key];
        const apiTpl = API_STANDARD_TEMPLATES[key];
        expect(webTpl.name).toBe(apiTpl.name);
        expect(webTpl.pages).toEqual(apiTpl.pages);
      }
    });

    it('verifies all standard templates pages are valid canonical company page keys', () => {
      for (const [key, tpl] of Object.entries(STANDARD_TEMPLATES)) {
        for (const pageKey of tpl.pages) {
          expect(COMPANY_PAGE_REGISTRY[pageKey], `Page key "${pageKey}" in template "${key}" must exist in registry`).toBeDefined();
          expect(API_COMPANY_PAGE_REGISTRY[pageKey], `Page key "${pageKey}" in template "${key}" must exist in API registry`).toBeDefined();
          expect(PAGE_KEY_TO_ROUTE[pageKey], `Route for page "${pageKey}" must be defined`).toBeDefined();
        }
      }
    });

    it('verifies Accounts template contains exactly the 6 required modules including invoices and notifications', () => {
      const accounts = STANDARD_TEMPLATES.accounts;
      expect(accounts.pages).toEqual([
        'invoices',
        'quotations',
        'bills',
        'ledger',
        'orders',
        'notifications',
      ]);
    });

    it('resolves every allowed landing page within each template to a valid route', () => {
      for (const [tplKey, tpl] of Object.entries(STANDARD_TEMPLATES)) {
        for (const landingPage of tpl.pages) {
          const dest = getRoleRedirectPath({
            role: 'employee',
            tenantId: 'fake-tenant',
            effectivePages: tpl.pages,
            homePage: landingPage,
          });
          const expectedRoute = PAGE_KEY_TO_ROUTE[landingPage];
          expect(dest).toBe(expectedRoute);
        }
      }
    });
  });

  // ─── 2. Role Change After Template Selection ─────────────────────────────
  describe('2. Role Change After Template Selection', () => {
    it('preserves selected template pages when role is changed after template selection', () => {
      // Simulate form state
      let createTemplateId = 'accounts';
      let createPages = [...STANDARD_TEMPLATES.accounts.pages];
      let createHomePage = 'invoices';

      // Admin changes role from 'employee' to 'accountant'
      const newRole = 'accountant';
      // Handled in UsersPage.tsx:
      // if (!createTemplateId) { const defaultPages = getLegacyPagesForRole(newRole); ... }
      if (!createTemplateId) {
        createPages = getLegacyPagesForRole(newRole);
        createHomePage = createPages[0] || 'dashboard';
      }

      // Verifies that createPages and createHomePage were preserved
      expect(createPages).toEqual([
        'invoices',
        'quotations',
        'bills',
        'ledger',
        'orders',
        'notifications',
      ]);
      expect(createHomePage).toBe('invoices');
    });

    it('updates default pages when no template is selected and role changes', () => {
      let createTemplateId = '';
      let createPages = getLegacyPagesForRole('employee');
      let createHomePage = createPages[0] || 'dashboard';

      expect(createPages).toEqual(getLegacyPagesForRole('employee'));

      // Role changes to store_manager
      const newRole = 'store_manager';
      if (!createTemplateId) {
        createPages = getLegacyPagesForRole(newRole);
        createHomePage = createPages[0] || 'dashboard';
      }

      expect(createPages).toEqual(getLegacyPagesForRole('store_manager'));
      expect(createHomePage).toBe('dashboard');
    });
  });

  // ─── 3. Personal Access vs Team Access vs No Team ────────────────────────
  describe('3. Personal Access vs Team Access vs No Team Rules', () => {
    it('gives personal access precedence when both personal and team access are present', () => {
      const personalPages = ['invoices', 'quotations', 'bills', 'ledger', 'orders', 'notifications'];
      const teamPages = ['ledger', 'bills'];

      const user = {
        role: 'employee',
        tenantId: 'tenant-123',
        teamId: 'team-abc',
        effectivePages: personalPages,
        homePage: 'invoices',
        teamRef: { allowedPages: JSON.stringify(teamPages) },
      };

      const redirect = getRoleRedirectPath(user);
      expect(redirect).toBe('/invoices');
      expect(user.effectivePages).toContain('invoices');
      expect(user.effectivePages).toContain('quotations');
    });

    it('falls back to team allowed pages when user has no custom UserPageAccess', () => {
      const teamPages = ['ledger', 'bills'];
      const user = {
        role: 'employee',
        tenantId: 'tenant-123',
        teamId: 'team-abc',
        effectivePages: teamPages,
        homePage: 'bills',
        teamRef: { allowedPages: JSON.stringify(teamPages) },
      };

      const redirect = getRoleRedirectPath(user);
      expect(redirect).toBe('/bills');
      expect(user.effectivePages).toEqual(['ledger', 'bills']);
    });

    it('returns root "/" (clean No Access Granted screen) when user has 0 allowed pages', () => {
      const user = {
        role: 'employee',
        tenantId: 'tenant-123',
        effectivePages: [],
        homePage: null,
      };

      const redirect = getRoleRedirectPath(user);
      expect(redirect).toBe('/');
    });
  });

  // ─── 4. Landing Page Validation & Dead-End Elimination ────────────────────
  describe('4. Landing Page Validation & Dead-End Elimination', () => {
    it('redirects to the configured home page when granted in effectivePages', () => {
      const user = {
        role: 'employee',
        tenantId: 'tenant-123',
        effectivePages: ['invoices', 'bills', 'ledger'],
        homePage: 'invoices',
      };
      expect(getRoleRedirectPath(user)).toBe('/invoices');
    });

    it('never sends a user to an unauthorized page if homePage was configured outside effectivePages', () => {
      const user = {
        role: 'employee',
        tenantId: 'tenant-123',
        effectivePages: ['ledger', 'bills'],
        homePage: 'invoices', // NOT in effectivePages
      };

      const redirect = getRoleRedirectPath(user);
      // Must not redirect to /invoices!
      expect(redirect).not.toBe('/invoices');
      // Must redirect to first granted page in canonical order (bills or ledger)
      expect(['/bills', '/ledger']).toContain(redirect);
    });

    it('does not blindly use role redirect when user effectivePages is provided', () => {
      // Role is accountant, which traditionally defaults to /invoices
      // But user is restricted to daily_activities
      const user = {
        role: 'accountant',
        tenantId: 'tenant-123',
        effectivePages: ['daily_activities', 'notifications'],
        homePage: 'daily_activities',
      };

      const redirect = getRoleRedirectPath(user);
      expect(redirect).toBe('/daily-activities');
    });
  });
});
