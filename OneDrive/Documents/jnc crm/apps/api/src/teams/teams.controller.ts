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
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { TeamsService, CreateTeamDto, UpdateTeamDto } from './teams.service';
import { PageAccess } from '../auth/page-access.decorator';

@Controller('teams')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('users') // Bound to the same module as Users setup
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async findAll(@CurrentUser() user: ScopedUser) {
    return this.teamsService.findAll(user);
  }

  @Post()
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async createTeam(@CurrentUser() user: ScopedUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.createTeam(dto, user);
  }

  @Patch(':id')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async updateTeam(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(id, dto, user);
  }
}
