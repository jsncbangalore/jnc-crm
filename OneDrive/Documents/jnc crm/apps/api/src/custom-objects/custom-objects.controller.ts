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
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { CustomObjectsService } from './custom-objects.service';

@Controller('custom-objects')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('tenant_admin', 'admin')
@PageAccess('custom_objects')
export class CustomObjectsController {
  constructor(private customObjectsService: CustomObjectsService) {}

  @Get()
  getAllObjects(@CurrentUser() user: ScopedUser) {
    return this.customObjectsService.getAllObjects(user);
  }

  @Get(':id')
  getObjectById(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.customObjectsService.getObjectById(id, user);
  }

  @Post()
  createObject(
    @Body()
    data: {
      apiName: string;
      label: string;
      pluralLabel?: string;
      description?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.createObject(data, user);
  }

  @Patch(':id')
  updateObject(
    @Param('id') id: string,
    @Body()
    data: {
      label?: string;
      pluralLabel?: string;
      description?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.updateObject(id, data, user);
  }

  @Delete(':id')
  deleteObject(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.customObjectsService.deleteObject(id, user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Fields Endpoints
  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':id/fields')
  getObjectFields(
    @Param('id') objectId: string,
    @Query('includeDeleted') includeDeleted: string | undefined,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.getObjectFields(objectId, includeDeleted === 'true', user);
  }

  @Post(':id/fields')
  createField(
    @Param('id') objectId: string,
    @Body()
    data: {
      apiName: string;
      label: string;
      fieldType: string;
      isRequired?: boolean;
      isUnique?: boolean;
      picklistValues?: string[] | string;
      lookupTargetObject?: string;
      displayOrder?: number;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.createField(objectId, data, user);
  }

  @Patch(':id/fields/:fieldId')
  updateField(
    @Param('id') objectId: string,
    @Param('fieldId') fieldId: string,
    @Body()
    data: {
      label?: string;
      fieldType?: string;
      isRequired?: boolean;
      isUnique?: boolean;
      picklistValues?: string[] | string;
      lookupTargetObject?: string;
      displayOrder?: number;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.updateField(objectId, fieldId, data, user);
  }

  @Delete(':id/fields/:fieldId')
  softDeleteField(
    @Param('id') objectId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.softDeleteField(objectId, fieldId, user);
  }

  @Patch(':id/fields/:fieldId/restore')
  restoreField(
    @Param('id') objectId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.restoreField(objectId, fieldId, user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Generic Record CRUD Endpoints (Phase 2)
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('lookups/:targetObject')
  getLookupOptions(
    @Param('targetObject') targetObject: string,
    @Query('search') search: string | undefined,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.getLookupOptions(targetObject, search, user);
  }

  @Get(':objectApiName/records')
  getRecords(
    @Param('objectApiName') objectApiName: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' | undefined,
    @Query('includeArchived') includeArchived: string | undefined,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.getRecords(objectApiName, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
      search,
      sortBy,
      sortOrder,
      includeArchived: includeArchived === 'true',
    }, user);
  }

  @Get(':objectApiName/records/:recordId')
  getRecordById(
    @Param('objectApiName') objectApiName: string,
    @Param('recordId') recordId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.getRecordById(objectApiName, recordId, user);
  }

  @Post(':objectApiName/records')
  createRecord(
    @Param('objectApiName') objectApiName: string,
    @Body() submittedData: Record<string, any>,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.createRecord(objectApiName, submittedData, user);
  }

  @Patch(':objectApiName/records/:recordId')
  updateRecord(
    @Param('objectApiName') objectApiName: string,
    @Param('recordId') recordId: string,
    @Body() submittedData: Record<string, any>,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.updateRecord(objectApiName, recordId, submittedData, user);
  }

  @Delete(':objectApiName/records/:recordId')
  deleteRecord(
    @Param('objectApiName') objectApiName: string,
    @Param('recordId') recordId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.customObjectsService.deleteRecord(objectApiName, recordId, user);
  }
}
