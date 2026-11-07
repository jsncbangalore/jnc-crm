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

  @Get('analytics/leads')
  @PageAccess('dashboard', 'leads')
  getLeadsAnalytics(@CurrentUser() user: ScopedUser, @Query('range') range?: string) {
    return this.dashboardService.getLeadsAnalytics(user, range);
  }

  @Get('analytics/quotes')
  @PageAccess('dashboard', 'quotations')
  getQuotesAnalytics(@CurrentUser() user: ScopedUser, @Query('range') range?: string) {
    return this.dashboardService.getQuotesAnalytics(user, range);
  }

  @Get('analytics/orders')
  @PageAccess('dashboard', 'orders')
  getOrdersAnalytics(@CurrentUser() user: ScopedUser, @Query('range') range?: string) {
    return this.dashboardService.getOrdersAnalytics(user, range);
  }

  @Get('analytics/receivables')
  @PageAccess('dashboard', 'invoices')
  getReceivablesAnalytics(@CurrentUser() user: ScopedUser) {
    return this.dashboardService.getReceivablesAnalytics(user);
  }

  @Get('analytics/overdue')
  @PageAccess('dashboard', 'invoices')
  getOverdueAnalytics(@CurrentUser() user: ScopedUser) {
    return this.dashboardService.getOverdueAnalytics(user);
  }

  @Get('analytics/activity')
  @PageAccess('dashboard', 'daily_activities')
  getActivityAnalytics(@CurrentUser() user: ScopedUser, @Query('range') range?: string) {
    return this.dashboardService.getActivityAnalytics(user, range);
  }

  @Patch('activities/:id/complete')
  completeActivity(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.dashboardService.completeActivity(id, user);
  }
}
