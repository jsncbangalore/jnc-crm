import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { ActivitiesService } from './activities.service';
import { CreateProjectDto, UpdateProjectDto, AssignMembersDto, UploadLogDto } from './dto/project.dto';
import { validateUploadedFile } from '../common/file-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';

@Controller('activities')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'project_manager', 'developer_lead', 'developer', 'employee')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ─── Projects ────────────────────────────────────────────────────────────────

  @Get('projects')
  async listProjects(@CurrentUser() user: ScopedUser) {
    return this.activitiesService.listProjects(user);
  }

  @Post('projects')
  async createProject(
    @Body() body: CreateProjectDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.activitiesService.createProject(user, body);
  }

  @Put('projects/:id')
  async updateProject(
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.activitiesService.updateProject(user, id, body);
  }

  @Delete('projects/:id')
  async deleteProject(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.activitiesService.deleteProject(user, id);
  }

  // ─── Developer & Lead Assignment ─────────────────────────────────────────────

  @Get('assignable-users')
  async getAssignableUsers(@CurrentUser() user: ScopedUser) {
    return this.activitiesService.getAssignableUsers(user);
  }

  @Post('projects/:id/assign')
  async assignMembers(
    @Param('id') projectId: string,
    @Body() body: AssignMembersDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.activitiesService.assignMembers(user, projectId, body.memberIds || []);
  }

  // ─── Daily Logs ───────────────────────────────────────────────────────────────

  @Get('projects/:projectId/logs')
  async listLogs(@Param('projectId') projectId: string, @CurrentUser() user: ScopedUser) {
    return this.activitiesService.listLogs(user, projectId);
  }

  @Post('projects/:projectId/logs')
  async createDailyLog(
    @Param('projectId') projectId: string,
    @Body() body: UploadLogDto,
    @CurrentUser() user: ScopedUser,
  ) {
    const taskSummary = body?.taskSummary || '';
    if (!taskSummary.trim()) {
      throw new BadRequestException('Please enter a task summary.');
    }
    return this.activitiesService.createLog(user, projectId, {
      taskSummary,
      records: [],
    });
  }

  @Post('projects/:projectId/logs/upload')

  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadLog(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadLogDto,
    @CurrentUser() user: ScopedUser,
  ) {
    const taskSummary = body?.taskSummary || '';
    if (!file && (!taskSummary || !taskSummary.trim())) {
      throw new BadRequestException('Please enter a summary or select a file to upload.');
    }

    if (file) {
      validateUploadedFile(file, 'spreadsheet', 20 * 1024 * 1024);
    }

    let records: any[] = [];
    let fileName: string | undefined = undefined;

    if (file) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        throw new BadRequestException('Only .xlsx, .xls or .csv files are accepted.');
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      fileName = file.originalname;
    }

    return this.activitiesService.createLog(user, projectId, {
      fileName,
      taskSummary,
      records,
    });
  }

  @Delete('projects/:projectId/logs/:logId')
  async deleteLog(
    @Param('projectId') projectId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.activitiesService.deleteLog(user, projectId, logId);
  }
}
