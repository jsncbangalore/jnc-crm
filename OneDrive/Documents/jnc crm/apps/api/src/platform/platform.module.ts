/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController, PlatformAdminsController, SystemInfoController, PlatformAnalyticsController } from './platform.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [PlatformController, PlatformAdminsController, SystemInfoController, PlatformAnalyticsController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
