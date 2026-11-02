/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

const isBackupControllerEnabled =
  (process.env.ENABLE_INAPP_BACKUP === 'true' || process.env.ENABLE_DB_ADMIN_ENDPOINTS === 'true') &&
  process.env.NODE_ENV !== 'production';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: isBackupControllerEnabled ? [BackupController] : [],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
