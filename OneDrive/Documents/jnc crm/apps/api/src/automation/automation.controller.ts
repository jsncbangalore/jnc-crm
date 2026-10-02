/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AutomationService } from './automation.service';

@Controller('automation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('tenant_admin', 'admin')
@PageAccess('automation')
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Get('rules')
  getAllRules(
    @Query('search') search?: string,
    @Query('triggerEvent') triggerEvent?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.automationService.getAllRules({
      search,
      triggerEvent,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('metrics')
  getMetrics() {
    return this.automationService.getMetrics();
  }

  @Get('rules/:id')
  getRuleById(@Param('id') id: string) {
    return this.automationService.getRuleById(id);
  }

  @Post('rules')
  createRule(
    @Body()
    data: {
      name: string;
      triggerEvent: string;
      conditionJson?: string;
      actionType?: string;
      actionPayloadJson?: string;
      steps?: Array<{ stepType: string; config: any; stepOrder?: number }>;
      isActive?: boolean;
    },
  ) {
    return this.automationService.createRule(data);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      triggerEvent?: string;
      conditionJson?: string;
      actionType?: string;
      actionPayloadJson?: string;
      steps?: Array<{ stepType: string; config: any; stepOrder?: number }>;
      isActive?: boolean;
    },
  ) {
    return this.automationService.updateRule(id, data);
  }

  @Patch('rules/:id/toggle')
  toggleRule(@Param('id') id: string, @Body('isActive') isActive?: boolean) {
    return this.automationService.toggleRuleActive(id, isActive);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.automationService.deleteRule(id);
  }

  @Post('run-nightly-reorder')
  runNightlyReorderCheck() {
    return this.automationService.runNightlyReorderCheck();
  }

  @Post('process-delayed-jobs')
  processDelayedJobs() {
    return this.automationService.processDelayedJobs();
  }
}
