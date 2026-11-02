import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, AuditModule, LedgerModule, PaymentsModule],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
