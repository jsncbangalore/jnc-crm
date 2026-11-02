/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/page-access.decorator';

export const API_VERSION = '1.2.0';
const STARTED_AT = new Date().toISOString();

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      version: API_VERSION,
      apiVersion: API_VERSION,
      commitId: process.env.GIT_COMMIT_HASH || process.env.RENDER_GIT_COMMIT || 'unknown',
      buildTime: process.env.BUILD_TIME || STARTED_AT,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      features: [
        'auth',
        'rbac',
        'password-reset-flow',
        'two-factor-auth',
        'device-sessions',
        'web-form-settings',
        'meta-whatsapp-webhooks',
        'indiamart-webhooks',
      ],
    };
  }
}
