/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/page-access.decorator';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      version: '1.0.0',
    };
  }
}
