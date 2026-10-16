/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { DualKeyThrottlerGuard } from './common/dual-key-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LeadsModule } from './leads/leads.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AutomationModule } from './automation/automation.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { CustomObjectsModule } from './custom-objects/custom-objects.module';
import { CompaniesModule } from './companies/companies.module';
import { QuotationsModule } from './quotations/quotations.module';
import { BackupModule } from './backup/backup.module';
import { SettingsModule } from './settings/settings.module';
import { ActivitiesModule } from './activities/activities.module';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 10000 : 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    AuditModule,
    NotificationsModule,
    LeadsModule,
    WebhooksModule,
    OrdersModule,
    InventoryModule,
    SuppliersModule,
    AutomationModule,
    DashboardModule,
    InvoicingModule,
    UsersModule,
    TeamsModule,
    CustomObjectsModule,
    CompaniesModule,
    QuotationsModule,
    BackupModule,
    SettingsModule,
    ActivitiesModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DualKeyThrottlerGuard,
    },
  ],
})
export class AppModule {}
