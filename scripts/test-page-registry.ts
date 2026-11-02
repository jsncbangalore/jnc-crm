import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PAGE_ACCESS_KEY, IS_PUBLIC_KEY, AUTH_ONLY_KEY } from '../apps/api/src/auth/page-access.decorator';
import { ROLES_KEY } from '../apps/api/src/auth/roles.decorator';
import {
  PAGE_REGISTRY,
  ALL_PAGE_KEYS,
  COMPANY_PAGE_KEYS,
  PLATFORM_PAGE_KEYS,
  PAGE_GROUPS,
  isValidPageKey,
} from '../apps/api/src/auth/page-registry';

// Controllers
import { ActivitiesController } from '../apps/api/src/activities/activities.controller';
import { AuditController } from '../apps/api/src/audit/audit.controller';
import { AuthController } from '../apps/api/src/auth/auth.controller';
import { PlatformAuthController } from '../apps/api/src/auth/platform-auth.controller';
import { AutomationController } from '../apps/api/src/automation/automation.controller';
import { BackupController } from '../apps/api/src/backup/backup.controller';
import { CompaniesController } from '../apps/api/src/companies/companies.controller';
import { CustomObjectsController } from '../apps/api/src/custom-objects/custom-objects.controller';
import { DashboardController } from '../apps/api/src/dashboard/dashboard.controller';
import { HealthController } from '../apps/api/src/health/health.controller';
import { InventoryController } from '../apps/api/src/inventory/inventory.controller';
import { InvoicingController } from '../apps/api/src/invoicing/invoicing.controller';
import { LeadsController } from '../apps/api/src/leads/leads.controller';
import { NotificationsController } from '../apps/api/src/notifications/notifications.controller';
import { OrdersController } from '../apps/api/src/orders/orders.controller';
import { PlatformController } from '../apps/api/src/platform/platform.controller';
import { QuotationsController } from '../apps/api/src/quotations/quotations.controller';
import { SettingsController } from '../apps/api/src/settings/settings.controller';
import { SuppliersController } from '../apps/api/src/suppliers/suppliers.controller';
import { TeamsController } from '../apps/api/src/teams/teams.controller';
import { UsersController } from '../apps/api/src/users/users.controller';
import { PublicInquiryController } from '../apps/api/src/webhooks/public-inquiry.controller';
import { WebhooksController } from '../apps/api/src/webhooks/webhooks.controller';

const CONTROLLERS: { name: string; cls: any }[] = [
  { name: 'ActivitiesController', cls: ActivitiesController },
  { name: 'AuditController', cls: AuditController },
  { name: 'AuthController', cls: AuthController },
  { name: 'PlatformAuthController', cls: PlatformAuthController },
  { name: 'AutomationController', cls: AutomationController },
  { name: 'BackupController', cls: BackupController },
  { name: 'CompaniesController', cls: CompaniesController },
  { name: 'CustomObjectsController', cls: CustomObjectsController },
  { name: 'DashboardController', cls: DashboardController },
  { name: 'HealthController', cls: HealthController },
  { name: 'InventoryController', cls: InventoryController },
  { name: 'InvoicingController', cls: InvoicingController },
  { name: 'LeadsController', cls: LeadsController },
  { name: 'NotificationsController', cls: NotificationsController },
  { name: 'OrdersController', cls: OrdersController },
  { name: 'PlatformController', cls: PlatformController },
  { name: 'QuotationsController', cls: QuotationsController },
  { name: 'SettingsController', cls: SettingsController },
  { name: 'SuppliersController', cls: SuppliersController },
  { name: 'TeamsController', cls: TeamsController },
  { name: 'UsersController', cls: UsersController },
  { name: 'PublicInquiryController', cls: PublicInquiryController },
  { name: 'WebhooksController', cls: WebhooksController },
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, name: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function run() {
  console.log('=== PAGE REGISTRY & CONTROLLER PERMISSION TEST ===\n');

  // Test 1: Registry Integrity
  console.log('--- 1. Registry Integrity ---');
  assert(COMPANY_PAGE_KEYS.length === 20, 'Company page keys count is 20');
  assert(PLATFORM_PAGE_KEYS.length === 3, 'Platform page keys count is 3');
  assert(ALL_PAGE_KEYS.length === 23, 'All page keys count is 23');

  for (const key of ALL_PAGE_KEYS) {
    const entry = PAGE_REGISTRY[key];
    assert(Boolean(entry), `Registry entry exists for key: ${key}`);
    assert(entry.key === key, `Key matches entry.key for: ${key}`);
    assert(Boolean(entry.label && entry.label.length > 0), `Label exists for: ${key}`);
    assert(entry.frontendRoutes.length > 0, `Frontend routes exist for: ${key}`);
    assert(entry.controllers.length > 0, `Controllers specified for: ${key}`);
    assert(isValidPageKey(key), `isValidPageKey returns true for: ${key}`);
  }

  // Test 2: Separation of Company and Platform Pages
  console.log('\n--- 2. Company vs Platform Separation ---');
  for (const pk of PLATFORM_PAGE_KEYS) {
    assert(!COMPANY_PAGE_KEYS.includes(pk as any), `Platform key ${pk} is not in COMPANY_PAGE_KEYS`);
    assert((PAGE_REGISTRY[pk] as any).isPlatformOnly === true, `Platform key ${pk} has isPlatformOnly=true`);
  }

  // Test 3: Groups Valid
  console.log('\n--- 3. Page Groups ---');
  const validGroups = ['Sales', 'Operations', 'Finance', 'Work', 'Admin', 'Platform'];
  for (const group of PAGE_GROUPS) {
    assert(validGroups.includes(group), `Page group ${group} is valid`);
  }

  // Test 4: Controller Coverage - every controller route must have @PageAccess, @Public, @AuthOnly, or @Roles('platform_super_admin')
  console.log('\n--- 4. Controller Route Coverage ---');
  let checkedRoutes = 0;
  const uncoveredRoutes: string[] = [];

  for (const { name, cls } of CONTROLLERS) {
    const classPageAccess = Reflect.getMetadata(PAGE_ACCESS_KEY, cls);
    const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, cls);
    const classIsAuthOnly = Reflect.getMetadata(AUTH_ONLY_KEY, cls);
    const classRoles = Reflect.getMetadata(ROLES_KEY, cls);

    const prototype = cls.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    for (const prop of propertyNames) {
      if (prop === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
      if (!descriptor || typeof descriptor.value !== 'function') continue;

      const handler = descriptor.value;
      const isRoute =
        Reflect.hasMetadata(PATH_METADATA, handler) ||
        Reflect.hasMetadata(METHOD_METADATA, handler);

      if (!isRoute) continue;

      checkedRoutes++;
      const methodPageAccess = Reflect.getMetadata(PAGE_ACCESS_KEY, handler);
      const methodIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
      const methodIsAuthOnly = Reflect.getMetadata(AUTH_ONLY_KEY, handler);
      const methodRoles = Reflect.getMetadata(ROLES_KEY, handler);

      const hasPageAccess = Boolean(methodPageAccess || classPageAccess);
      const isPublic = Boolean(methodIsPublic || classIsPublic);
      const isAuthOnly = Boolean(methodIsAuthOnly || classIsAuthOnly);
      const isPlatformSuperAdmin =
        (Array.isArray(methodRoles) && methodRoles.includes('platform_super_admin')) ||
        (Array.isArray(classRoles) && classRoles.includes('platform_super_admin')) ||
        methodRoles === 'platform_super_admin' ||
        classRoles === 'platform_super_admin';

      const isProtected = hasPageAccess || isPublic || isAuthOnly || isPlatformSuperAdmin;

      if (!isProtected) {
        uncoveredRoutes.push(`${name}.${prop}`);
      }
    }
  }

  assert(checkedRoutes > 0, `Inspected ${checkedRoutes} total HTTP route handlers`);
  assert(
    uncoveredRoutes.length === 0,
    'All controller routes are protected with @PageAccess, @Public, @AuthOnly, or platform role',
    uncoveredRoutes.join(', '),
  );

  console.log(`\nResults: ${passedTests}/${totalTests} assertions passed (${failedTests} failed)`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
