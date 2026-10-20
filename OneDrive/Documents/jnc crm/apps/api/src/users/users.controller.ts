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
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateUploadedFile } from '../common/file-validator';
import { sanitizeRowForImport } from '../common/csv-sanitize.util';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async findAll(
    @CurrentUser() user: ScopedUser,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.usersService.findAll(user, { search, role, isActive, tenantId });
  }

  @Get('template-csv')
  @Roles('tenant_admin', 'admin', 'platform_super_admin')
  downloadTemplate(@Res() res: Response) {
    const csvContent = `Full Name,Email Address,Phone Number,Role,Team Name
Rajesh Sharma,rajesh.sharma@example.com,+91 98450 12345,employee,Sales Team Alpha
Pooja Patel,pooja.patel@example.com,+91 98200 55443,sub_admin,Operations
Anand Verma,anand.verma@example.com,+91 98111 22334,store_manager,Warehouse North
Siddharth Rao,siddharth.rao@example.com,+91 98765 43210,project_manager,Projects Hub
Kavita Nair,kavita.nair@example.com,+91 99001 12233,employee,Sales Team Beta
`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="jnc_users_import_template.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(csvContent);
  }

  @Post('import-preview')
  @Roles('tenant_admin', 'admin', 'platform_super_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async importPreview(
    @CurrentUser() user: ScopedUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: { records?: any[]; rows?: any[] },
  ) {
    let records: any[] = [];
    if (file) {
      validateUploadedFile(file, 'spreadsheet', 50 * 1024 * 1024);
      const lowerName = file.originalname.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        const csvContent = file.buffer.toString('utf-8');
        const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
        records = parseResult.data;
      }
    } else {
      records = body?.records || body?.rows || [];
    }
    const sanitized = records.map((r) => sanitizeRowForImport(r));
    return this.usersService.previewImportUsers(sanitized, user);
  }

  @Post('import-commit')
  @Roles('tenant_admin', 'admin', 'platform_super_admin')
  async importCommit(
    @CurrentUser() user: ScopedUser,
    @Body() body: { records?: any[]; rows?: any[] },
  ) {
    const records = body.records || body.rows || [];
    const sanitized = records.map((r) => sanitizeRowForImport(r));
    return this.usersService.commitImportUsers(sanitized, user);
  }


  @Get(':id')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async findOne(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    return this.usersService.findOne(id, user);
  }

  @Post()
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async createUser(@CurrentUser() user: ScopedUser, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto, user);
  }

  @Patch(':id')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async updateUser(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, dto, user);
  }

  @Post(':id/reset-credentials')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async resetCredentials(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    return this.usersService.resetCredentials(id, user);
  }

  @Post(':id/send-reset-code')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async sendResetCode(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.usersService.sendResetCode(id, user, ip, userAgent);
  }

  @Post(':id/revoke-sessions')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async revokeSessions(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    return this.usersService.revokeUserSessions(id, user);
  }

  @Post(':id/unlock')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async unlockUser(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    return this.usersService.unlockUser(id, user);
  }

  @Patch(':id/toggle-active')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async toggleActive(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
  ) {
    return this.usersService.toggleActive(id, user);
  }

  @Delete(':id')
  @Roles('platform_super_admin', 'tenant_admin', 'admin')
  async deleteUser(@CurrentUser() user: ScopedUser, @Param('id') id: string) {
    return this.usersService.deleteUser(id, user);
  }
}
