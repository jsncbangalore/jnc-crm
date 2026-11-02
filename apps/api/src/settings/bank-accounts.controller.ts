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
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { PageAccess } from '../auth/page-access.decorator';
import { BankAccountsService, CreateBankAccountDto, UpdateBankAccountDto } from './bank-accounts.service';

@Controller('settings/bank-accounts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  /**
   * GET /settings/bank-accounts
   * Accessible by all authenticated users to populate payment / receipt dropdowns.
   */
  @Get()
  async findAll(
    @CurrentUser() user: ScopedUser,
    @Query('includeInactive') includeInactive?: string
  ) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.findAll(tenantId, includeInactive === 'true');
  }

  /**
   * GET /settings/bank-accounts/:id
   */
  @Get(':id')
  async findOne(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.findOne(tenantId, id);
  }

  /**
   * POST /settings/bank-accounts
   * Restricted to tenant admins / admins.
   */
  @Post()
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async create(@CurrentUser() user: ScopedUser, @Body() body: CreateBankAccountDto) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.create(tenantId, body, user);
  }

  /**
   * PUT /settings/bank-accounts/:id
   */
  @Put(':id')
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async update(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
    @Body() body: UpdateBankAccountDto
  ) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.update(tenantId, id, body, user);
  }

  /**
   * PATCH /settings/bank-accounts/:id/default
   */
  @Patch(':id/default')
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async setDefault(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.setDefault(tenantId, id);
  }

  /**
   * PATCH /settings/bank-accounts/:id/document-default
   */
  @Patch(':id/document-default')
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async setDocumentDefault(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.setDocumentDefault(tenantId, id);
  }

  /**
   * PATCH /settings/bank-accounts/:id/deactivate
   */
  @Patch(':id/deactivate')
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async deactivate(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.deactivate(tenantId, id);
  }

  /**
   * PATCH /settings/bank-accounts/:id/activate
   */
  @Patch(':id/activate')
  @PageAccess('branding', 'ledger')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async activate(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    const tenantId = requireTenantId(user);
    return this.bankAccountsService.activate(tenantId, id);
  }
}
