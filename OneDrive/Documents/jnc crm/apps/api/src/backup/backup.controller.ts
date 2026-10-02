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
  UseGuards,
  Res,
  HttpStatus,
  HttpCode,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { BackupService } from './backup.service';

@Controller('system/backup')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin', 'tenant_admin', 'admin')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * Diagnostic summary of backup health, counts, and directory paths
   */
  @Get('status')
  async getStatus() {
    return this.backupService.getStatus();
  }

  /**
   * Trigger an immediate manual backup (Local + Offsite Dispatch)
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createBackup(@CurrentUser() user: ScopedUser) {
    return this.backupService.createBackup(user);
  }

  /**
   * Run an automated restore drill to prove backup restorability & data integrity
   */
  @Post('restore-drill')
  @HttpCode(HttpStatus.OK)
  async runRestoreDrill(@Body('filename') filename?: string) {
    return this.backupService.runRestoreDrill(filename);
  }

  /**
   * One-click download of the latest AES-256-GCM encrypted backup archive
   */
  @Get('download-latest')
  downloadLatestBackup(@Res() res: Response) {
    const { filename, buffer } = this.backupService.getLatestBackupFile();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(HttpStatus.OK).send(buffer);
  }
}
