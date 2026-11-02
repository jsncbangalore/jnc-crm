/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Module } from '@nestjs/common';
import { CustomObjectsService } from './custom-objects.service';
import { CustomObjectsController } from './custom-objects.controller';

@Module({
  controllers: [CustomObjectsController],
  providers: [CustomObjectsService],
  exports: [CustomObjectsService],
})
export class CustomObjectsModule {}
