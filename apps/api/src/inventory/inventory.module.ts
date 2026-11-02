import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { BackupModule } from '../backup/backup.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [AuthModule, AuditModule, BackupModule, LedgerModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
