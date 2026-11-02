import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { PostingService } from './posting.service';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaClient } from '@prisma/client';

@Module({
  imports: [AuditModule, PaymentsModule],
  controllers: [LedgerController],
  providers: [LedgerService, PostingService, PrismaClient],
  exports: [LedgerService, PostingService],
})
export class LedgerModule {}
