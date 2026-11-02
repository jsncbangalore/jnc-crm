/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { ScopingService } from '../auth/scoping.service';

@Module({
  imports: [PrismaModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, ScopingService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
