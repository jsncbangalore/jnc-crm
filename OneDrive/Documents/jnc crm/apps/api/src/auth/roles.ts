/**
 * Centralized Role Definitions & Hierarchy (Backend)
 */

export const ALL_ROLES = [
  'platform_super_admin',
  'tenant_admin',
  'admin',
  'sub_admin',
  'project_manager',
  'developer_lead',
  'store_manager',
  'finance',
  'accountant',
  'employee',
  'developer',
  'client',
  'customer',
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

export const ROLE_RANKS: Record<string, number> = {
  platform_super_admin: 100,
  tenant_admin: 80,
  admin: 60,
  sub_admin: 50,
  project_manager: 40,
  developer_lead: 35,
  store_manager: 30,
  finance: 25,
  accountant: 25,
  employee: 20,
  developer: 15,
  client: 10,
  customer: 10,
};

export const ROLE_LABELS: Record<string, string> = {
  platform_super_admin: 'Platform Super Administrator',
  tenant_admin: 'Company Administrator (Tenant Admin)',
  admin: 'Administrator',
  sub_admin: 'Sub-Administrator',
  project_manager: 'Project Manager',
  developer_lead: 'Developer Lead',
  store_manager: 'Store / Inventory Manager',
  finance: 'Finance Specialist',
  accountant: 'Accountant',
  employee: 'Employee / Sales Representative',
  developer: 'Developer',
  client: 'Client Portal',
  customer: 'Customer',
};

/**
 * Returns true if the user is the Platform Owner (vendor super admin with no tenant)
 */
export function isPlatformOwner(user?: { role?: string; tenantId?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'platform_super_admin' && !user.tenantId;
}

/**
 * Determines redirect path based on user role and tenant
 */
export function getRoleRedirectPath(user?: { role?: string; tenantId?: string | null } | null): string {
  if (!user) return '/login';
  if (isPlatformOwner(user)) {
    return '/platform/companies';
  }
  switch (user.role) {
    case 'tenant_admin':
    case 'admin':
    case 'sub_admin':
      return '/';
    case 'employee':
      return '/leads';
    case 'developer':
    case 'developer_lead':
    case 'project_manager':
      return '/daily-activities';
    case 'store_manager':
      return '/inventory';
    case 'finance':
    case 'accountant':
      return '/invoices';
    case 'client':
    case 'customer':
      return '/orders';
    default:
      return '/';
  }
}

/**
 * Returns roles that actor can assign (strictly lower rank; only platform_super_admin can create tenant_admin)
 */
export function getAllowedAssignableRoles(actorRole?: string): string[] {
  if (!actorRole) return [];
  const actorRank = ROLE_RANKS[actorRole] || 0;
  return ALL_ROLES.filter((role) => {
    if (role === 'platform_super_admin') return false;
    if (role === 'tenant_admin' && actorRole !== 'platform_super_admin') return false;
    return (ROLE_RANKS[role] || 0) < actorRank;
  });
}
