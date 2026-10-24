/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis(@CurrentUser() user: ScopedUser, @Query('range') range?: string) {
    return this.dashboardService.getKpis(user, range);
  }

  @Get('conversion')
  getConversion(@CurrentUser() user: ScopedUser) {
    return this.dashboardService.getLeadConversionStats(user);
  }

  @Patch('activities/:id/complete')
  completeActivity(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.dashboardService.completeActivity(id, user);
  }
}
