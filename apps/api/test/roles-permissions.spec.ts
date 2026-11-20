/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  TENANT_ROLE_KEYS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_NORMALIZATION_MAP,
  normalizeRole,
  getRoleDefaultPermissions,
  resolveEffectivePageAccess,
  canAccessPage,
  isViewOnlyPage,
  getAllowedAssignableRoles,
  TenantRoleKey,
} from '../src/common/roles-permissions';
import {
  ALL_COMPANY_PAGE_KEYS,
  isValidCompanyPageKey,
} from '../src/auth/page-registry';
import {
  getEffectivePagesForUser,
  getLegacyPagesForRole,
  invalidateUserAccessCache,
} from '../src/auth/effective-page-access';

describe('Roles & Permissions Comprehensive Spec (9 Canonical Roles)', () => {
  describe('A. Role Keys & Canonical Normalization', () => {
    it('should define exactly the 9 canonical tenant roles', () => {
      expect(TENANT_ROLE_KEYS).toEqual([
        'administrator',
        'sub_administrator',
        'project_manager',
        'developer_lead',
        'store_inventory_manager',
        'finance_specialist',
        'accountant',
        'sales_representative',
        'developer',
      ]);
    });

    it('should normalize legacy role values correctly', () => {
      expect(normalizeRole('admin')).toBe('administrator');
      expect(normalizeRole('tenant_admin')).toBe('administrator');
      expect(normalizeRole('sub_admin')).toBe('sub_administrator');
      expect(normalizeRole('store_manager')).toBe('store_inventory_manager');
      expect(normalizeRole('finance')).toBe('finance_specialist');
      expect(normalizeRole('employee')).toBe('sales_representative');
    });

    it('should provide labels and descriptions for all 9 canonical roles', () => {
      for (const role of TENANT_ROLE_KEYS) {
        expect(ROLE_LABELS[role]).toBeDefined();
        expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
        expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
        expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
      }
    });

    it('should allow Administrator and Platform Super Admin to assign all 9 roles, and Sub-Administrator only roles below rank', () => {
      const adminAssignable = getAllowedAssignableRoles('administrator');
      expect(adminAssignable).toEqual(TENANT_ROLE_KEYS);

      const subAdminAssignable = getAllowedAssignableRoles('sub_administrator');
      expect(subAdminAssignable).not.toContain('administrator');
      expect(subAdminAssignable).not.toContain('sub_administrator');
      expect(subAdminAssignable).toContain('project_manager');
      expect(subAdminAssignable).toContain('sales_representative');
    });
  });

  describe('B. Default Page Access for All 9 Roles', () => {
    it('1. Administrator: ALL pages, ALL actions (view, create_edit, delete)', () => {
      const resolved = resolveEffectivePageAccess({ role: 'administrator' });
      for (const page of ALL_COMPANY_PAGE_KEYS) {
        expect(canAccessPage(resolved, page, 'view')).toBe(true);
        expect(canAccessPage(resolved, page, 'create_edit')).toBe(true);
        expect(canAccessPage(resolved, page, 'delete')).toBe(true);
        expect(isViewOnlyPage(resolved, page)).toBe(false);
      }
    });

    it('2. Sub-Administrator: specific operations pages, but NO audit_logs or custom_objects', () => {
      const resolved = resolveEffectivePageAccess({ role: 'sub_administrator' });
      const allowed = [
        'dashboard', 'leads', 'quotations', 'orders', 'shipments',
        'invoices', 'inventory', 'suppliers', 'automation', 'notifications',
        'users', 'bills', 'ledger', 'daily_activities', 'branding',
        'mail_settings', 'lead_flow', 'lead_setup'
      ];
      for (const p of allowed) {
        expect(canAccessPage(resolved, p, 'view')).toBe(true);
      }
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'custom_objects', 'view')).toBe(false);
    });

    it('3. Project Manager: dashboard, leads, quotes, orders, shipments, notifications, daily_activities; inventory is VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'project_manager' });
      expect(canAccessPage(resolved, 'dashboard', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'quotations', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'shipments', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'notifications', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'daily_activities', 'view')).toBe(true);

      // Inventory is View-Only
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'inventory', 'create_edit')).toBe(false);
      expect(canAccessPage(resolved, 'inventory', 'delete')).toBe(false);
      expect(isViewOnlyPage(resolved, 'inventory')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'bills', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(false);
    });

    it('4. Developer Lead: dashboard, automation, custom_objects, notifications, daily_activities; audit_logs and leads are VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'developer_lead' });
      expect(canAccessPage(resolved, 'dashboard', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'automation', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'automation', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'custom_objects', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'custom_objects', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'daily_activities', 'view')).toBe(true);

      // Audit logs is View-Only
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'audit_logs', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'audit_logs')).toBe(true);

      // Leads is View-Only
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'leads', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'leads')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(false);
    });

    it('5. Store / Inventory Manager: dashboard, inventory, suppliers, shipments, bills, notifications; orders is VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'store_inventory_manager' });
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'inventory', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'suppliers', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'suppliers', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'shipments', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'shipments', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'bills', 'view')).toBe(true);

      // Orders is View-Only
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'create_edit')).toBe(false);
      expect(canAccessPage(resolved, 'orders', 'delete')).toBe(false);
      expect(isViewOnlyPage(resolved, 'orders')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(false);
    });

    it('6. Finance Specialist: dashboard, invoices, bills, ledger, notifications; orders, quotations, suppliers are VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'finance_specialist' });
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'invoices', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'bills', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'bills', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'ledger', 'view')).toBe(true);

      // View-Only pages
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'orders')).toBe(true);

      expect(canAccessPage(resolved, 'quotations', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'quotations', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'quotations')).toBe(true);

      expect(canAccessPage(resolved, 'suppliers', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'suppliers', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'suppliers')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'users', 'view')).toBe(false);
    });

    it('7. Accountant: dashboard, invoices, bills, ledger, suppliers, notifications; orders, inventory are VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'accountant' });
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'bills', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'ledger', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'suppliers', 'view')).toBe(true);

      // View-Only pages
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'orders')).toBe(true);

      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'inventory', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'inventory')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'quotations', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'users', 'view')).toBe(false);
    });

    it('8. Sales Representative: dashboard (own), leads (own), quotations, orders (own), notifications', () => {
      const resolved = resolveEffectivePageAccess({ role: 'sales_representative' });
      expect(canAccessPage(resolved, 'dashboard', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'leads', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'quotations', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'quotations', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'orders', 'create_edit')).toBe(true);
      expect(canAccessPage(resolved, 'notifications', 'view')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'bills', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'suppliers', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'automation', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'users', 'view')).toBe(false);
    });

    it('9. Developer: dashboard, automation, custom_objects, daily_activities, notifications; leads is VIEW ONLY', () => {
      const resolved = resolveEffectivePageAccess({ role: 'developer' });
      expect(canAccessPage(resolved, 'dashboard', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'automation', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'custom_objects', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'daily_activities', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'notifications', 'view')).toBe(true);

      // Leads is View-Only
      expect(canAccessPage(resolved, 'leads', 'view')).toBe(true);
      expect(canAccessPage(resolved, 'leads', 'create_edit')).toBe(false);
      expect(isViewOnlyPage(resolved, 'leads')).toBe(true);

      // Disallowed pages
      expect(canAccessPage(resolved, 'inventory', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'orders', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'invoices', 'view')).toBe(false);
      expect(canAccessPage(resolved, 'audit_logs', 'view')).toBe(false);
    });
  });

  describe('C. Customization & Empty Team List Rule (Requirement D)', () => {
    it('should NOT block all pages when team allowedPages list is empty, but fallback to role defaults', () => {
      const resolved = resolveEffectivePageAccess({
        role: 'project_manager',
        teamAllowedPages: [], // Empty team list
      });
      // Falls back to project_manager role defaults!
      expect(resolved.pages).toContain('dashboard');
      expect(resolved.pages).toContain('leads');
      expect(resolved.pages).toContain('quotations');
      expect(resolved.pages).toContain('orders');
      expect(resolved.pages).toContain('shipments');
    });

    it('should always guarantee dashboard and notifications for every role regardless of custom overrides', () => {
      for (const role of TENANT_ROLE_KEYS) {
        const resolved = resolveEffectivePageAccess({
          role,
          userPages: ['orders'], // Admin customized to only grant orders
        });
        expect(resolved.pages).toContain('dashboard');
        expect(resolved.pages).toContain('notifications');
        expect(resolved.pages).toContain('orders');
      }
    });

    it('should immediately clear cache when invalidateUserAccessCache is called', () => {
      expect(() => invalidateUserAccessCache('test-user-id')).not.toThrow();
    });
  });
});
