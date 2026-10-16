/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { PublicInquiryController } from './public-inquiry.controller';
import { LeadsModule } from '../leads/leads.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [LeadsModule, PrismaModule],
  controllers: [WebhooksController, PublicInquiryController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

