import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AuditModule } from '../audit/audit.module';
import { DocumentSeriesService } from '../common/document-series.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, DocumentSeriesService],
  exports: [PaymentsService, DocumentSeriesService],
})
export class PaymentsModule {}
